#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * D.Scribe Analysis Worker — Standalone microservice
 *
 * Handles key points extraction, voice profile, and mind map generation
 * outside of Next.js to avoid bundler memory bloat.
 *
 * Runs on port 3002, called by Next.js API routes via HTTP proxy.
 */

const http = require('http');
const { createClient } = require('@supabase/supabase-js');

// ─── Load env ─────────────────────────────────────────────────
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

const envPath = join(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = parseInt(process.env.WORKER_PORT || '3002', 10);

if (!SUPABASE_URL || !SUPABASE_KEY || !ANTHROPIC_KEY) {
  console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Claude API (raw fetch, no SDK) ──────────────────────────
async function askClaude(system, userMessage, opts = {}) {
  const models = {
    fast: 'claude-haiku-4-5-20251001',
    quality: 'claude-sonnet-4-20250514',
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: models[opts.model || 'quality'],
      max_tokens: opts.maxTokens || 8192,
      temperature: opts.temperature || 0.6,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const block = data.content?.[0];
  return block?.type === 'text' ? block.text : '';
}

function cleanJson(raw) {
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```[\s\S]*$/, '');
  }
  s = s.trim();
  const start = s[0];
  if (start === '[' || start === '{') {
    const close = start === '[' ? ']' : '}';
    let depth = 0, inStr = false, esc = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') depth--;
      if (depth === 0) return s.slice(0, i + 1);
    }
  }
  return s;
}

// ─── Chunker ──────────────────────────────────────────────────
function chunkTranscript(text, chunkSize = 3000, overlap = 200) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= chunkSize) {
    return [{ text, wordCount: words.length, index: 0, totalChunks: 1 }];
  }

  const chunks = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunkWords = words.slice(start, end);

    if (end < words.length) {
      const lastFifty = chunkWords.slice(-50).join(' ');
      const sentenceEnd = lastFifty.search(/[.!?]\s+(?=[A-Z])/);
      if (sentenceEnd !== -1) {
        const trimTo = chunkWords.length - 50 + lastFifty.slice(0, sentenceEnd + 1).split(/\s+/).length;
        chunkWords.length = trimTo;
      }
    }

    chunks.push({
      text: chunkWords.join(' '),
      wordCount: chunkWords.length,
      index: chunks.length,
      totalChunks: 0,
      startWord: start,
    });

    start = start + chunkWords.length - overlap;
    if (start >= words.length) break;
  }

  for (const chunk of chunks) chunk.totalChunks = chunks.length;
  return chunks;
}

// ─── Prosody (CJS mirror of src/lib/prosody.ts — keep the math in sync) ──────
const PROSODY = {
  MIN_WORDS_FOR_PACE: 4, MIN_DURATION_SEC: 0.8,
  PAUSE_FLOOR_SEC: 0.35, PAUSE_SATURATION_SEC: 2.5,
  NGRAM_SIZE: 4, W_SLOW: 0.5, W_PAUSE: 0.3, W_REP: 0.2,
  TOP_MIN_EMPHASIS: 0.5, TOP_MIN_WORDS: 5,
};

function tokenizeWords(text) { return text.split(/\s+/).filter(Boolean); }
function clamp01(n) { return Math.max(0, Math.min(1, n)); }
function median(values) {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function normalizeForMatch(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function computeRepetition(segments) {
  const owners = new Map();
  segments.forEach((seg, i) => {
    const words = tokenizeWords(normalizeForMatch(seg.text));
    for (let w = 0; w + PROSODY.NGRAM_SIZE <= words.length; w++) {
      const gram = words.slice(w, w + PROSODY.NGRAM_SIZE).join(' ');
      if (!owners.has(gram)) owners.set(gram, new Set());
      owners.get(gram).add(i);
    }
  });
  const scores = new Array(segments.length).fill(0);
  for (const set of owners.values()) {
    if (set.size >= 2) for (const i of set) scores[i] = 1;
  }
  return scores;
}

function computeUtteranceEmphasis(segments) {
  const repetition = computeRepetition(segments);
  const paceSamples = new Map();
  const paces = segments.map((seg) => {
    const words = tokenizeWords(seg.text).length;
    const duration = seg.end - seg.start;
    if (words < PROSODY.MIN_WORDS_FOR_PACE || duration < PROSODY.MIN_DURATION_SEC) return 0;
    const pace = words / duration;
    if (!paceSamples.has(seg.speaker)) paceSamples.set(seg.speaker, []);
    paceSamples.get(seg.speaker).push(pace);
    return pace;
  });
  const medians = new Map();
  for (const [speaker, samples] of paceSamples) medians.set(speaker, median(samples));

  let wordCursor = 0;
  return segments.map((seg, i) => {
    const wordCount = tokenizeWords(seg.text).length;
    const wordStart = wordCursor;
    wordCursor += wordCount;
    const pace = paces[i];
    const med = medians.get(seg.speaker) || 0;
    const slowness = pace > 0 && med > 0 ? clamp01(med / pace - 1) : 0;
    const prev = segments[i - 1];
    const pauseBefore = prev ? Math.max(0, seg.start - prev.end) : 0;
    const pauseWeight = clamp01(
      (pauseBefore - PROSODY.PAUSE_FLOOR_SEC) / (PROSODY.PAUSE_SATURATION_SEC - PROSODY.PAUSE_FLOOR_SEC)
    );
    const emphasis = clamp01(
      PROSODY.W_SLOW * slowness + PROSODY.W_PAUSE * pauseWeight + PROSODY.W_REP * repetition[i]
    );
    return {
      index: i, start: seg.start, end: seg.end, wordStart, wordEnd: wordCursor,
      pace, pauseBefore, slowness, pauseWeight, repetition: repetition[i], emphasis,
      text: seg.text, speaker: seg.speaker,
    };
  });
}

function chunkEmphasisFor(emphases, startWord, endWord) {
  let weightedSum = 0, overlapTotal = 0, max = 0;
  const inChunk = [];
  for (const u of emphases) {
    const overlap = Math.min(u.wordEnd, endWord) - Math.max(u.wordStart, startWord);
    if (overlap <= 0) continue;
    weightedSum += u.emphasis * overlap;
    overlapTotal += overlap;
    if (u.emphasis > max) max = u.emphasis;
    inChunk.push(u);
  }
  const topUtterances = inChunk
    .filter((u) => u.emphasis >= PROSODY.TOP_MIN_EMPHASIS && u.wordEnd - u.wordStart >= PROSODY.TOP_MIN_WORDS)
    .sort((a, b) => b.emphasis - a.emphasis)
    .slice(0, 3);
  return { mean: overlapTotal > 0 ? weightedSum / overlapTotal : 0, max, topUtterances };
}

function quoteMatchesEmphasis(quote, topUtterances) {
  const normQuote = normalizeForMatch(quote);
  if (normQuote.length < 20) return false;
  return topUtterances.some((u) => {
    const normUtt = normalizeForMatch(u.text);
    if (normUtt.length < 20) return false;
    return normUtt.includes(normQuote) || normQuote.includes(normUtt);
  });
}

function relevanceFromDelivery(supportingQuotes, chunk) {
  const backed = supportingQuotes.some((q) => quoteMatchesEmphasis(q, chunk.topUtterances));
  if (backed) return 0.95;
  if (chunk.mean < 0.1 && chunk.max < 0.3) return 0.7;
  return 0.8;
}

function deliveryPromptBlock(chunk) {
  if (chunk.topUtterances.length === 0) return '';
  const moments = chunk.topUtterances
    .map((u, i) => {
      const signals = [];
      if (u.slowness > 0.3) signals.push('slowed down');
      if (u.pauseWeight > 0.3) signals.push(`paused ${u.pauseBefore.toFixed(1)}s before it`);
      if (u.repetition > 0) signals.push('repeated this phrasing elsewhere');
      return `${i + 1}. "${u.text.trim()}" (speaker ${signals.join(', ') || 'emphasized this'})`;
    })
    .join('\n');
  return `\n\nDELIVERY ANALYSIS (from the speaker's actual audio delivery — pace, pauses, repetition):
The speaker gave extra weight to these moments. Treat content overlapping them as high-priority key points:
${moments}`;
}

// ─── Prompts ──────────────────────────────────────────────────
const KEY_POINTS_SYSTEM = `You are an expert content analyst specializing in extracting key points from spoken content (sermons, lectures, keynotes, podcasts). Extract the most important, substantive points that would form the backbone of a book chapter. Focus on arguments, insights, stories, and teachings — not filler or transitions.

Return ONLY a JSON array of key point objects. No markdown, no explanation.`;

function keyPointsPrompt(chunkText, chunkIndex, totalChunks, previousTitles, deliveryBlock) {
  let prompt = `Extract key points from this transcript segment (chunk ${chunkIndex + 1} of ${totalChunks}).

Each key point should have:
- "title": A concise title (5-10 words)
- "summary": A 2-3 sentence summary of the point
- "supporting_quotes": Array of 1-3 direct quotes from the transcript that support this point
- "tags": Array of 2-4 topic tags

Return a JSON array of key point objects. Extract 3-8 key points per chunk.`;

  if (deliveryBlock) prompt += deliveryBlock;

  if (previousTitles.length > 0) {
    prompt += `\n\nKey points already extracted from previous chunks (avoid duplicates):\n${previousTitles.map(t => `- ${t}`).join('\n')}`;
  }

  prompt += `\n\nTranscript segment:\n"""\n${chunkText}\n"""`;
  return prompt;
}

// ─── Route handlers ───────────────────────────────────────────
async function handleKeyPoints(body) {
  const { project_id, transcript_id, chunk_index, previous_titles } = body;

  if (!project_id || !transcript_id || chunk_index === undefined) {
    return { status: 400, body: { error: 'project_id, transcript_id, and chunk_index required' } };
  }

  // Load transcript
  const { data: transcript, error: txErr } = await supabase
    .from('transcripts')
    .select('id, full_text, segments')
    .eq('id', transcript_id)
    .eq('project_id', project_id)
    .single();

  if (txErr || !transcript) {
    return { status: 404, body: { error: 'Transcript not found' } };
  }

  const chunks = chunkTranscript(transcript.full_text);
  const totalChunks = chunks.length;

  if (chunk_index >= totalChunks) {
    return { status: 200, body: { key_points: [], total_chunks: totalChunks, done: true } };
  }

  const chunk = chunks[chunk_index];

  // Delivery analysis (degrades to flat when segments are missing/empty)
  const emphases = computeUtteranceEmphasis(transcript.segments || []);
  const delivery = chunkEmphasisFor(emphases, chunk.startWord, chunk.startWord + chunk.wordCount);

  const prompt = keyPointsPrompt(
    chunk.text, chunk.index, chunk.totalChunks, previous_titles || [], deliveryPromptBlock(delivery)
  );

  console.log(`[worker] Processing chunk ${chunk_index + 1}/${totalChunks} (${chunk.wordCount} words)`);

  let raw;
  try {
    raw = await askClaude(KEY_POINTS_SYSTEM, prompt, { model: 'fast', maxTokens: 4096 });
  } catch (err) {
    console.error('[worker] Claude API error:', err.message);
    return { status: 500, body: { error: 'Key points extraction failed: ' + err.message } };
  }

  let keyPoints = [];
  try {
    keyPoints = JSON.parse(cleanJson(raw));
  } catch (parseErr) {
    console.error('[worker] Failed to parse key points:', parseErr.message);
    console.error('[worker] Raw response (first 300):', raw.slice(0, 300));
  }

  // Save to DB
  if (keyPoints.length > 0) {
    const { error: insertErr } = await supabase.from('key_points').insert(
      keyPoints.map(kp => ({
        project_id,
        transcript_id,
        title: kp.title,
        summary: kp.summary,
        supporting_quotes: kp.supporting_quotes || [],
        tags: kp.tags || [],
        relevance_score: relevanceFromDelivery(kp.supporting_quotes || [], delivery),
      }))
    );
    if (insertErr) {
      console.error('[worker] DB insert error:', insertErr.message);
      return { status: 500, body: { error: 'Failed to save key points: ' + insertErr.message } };
    }
  }

  console.log(`[worker] Extracted ${keyPoints.length} key points from chunk ${chunk_index + 1}`);

  return {
    status: 200,
    body: {
      key_points: keyPoints,
      total_chunks: totalChunks,
      chunk_index,
      done: chunk_index >= totalChunks - 1,
    },
  };
}

// ─── HTTP Server ──────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    const mem = process.memoryUsage();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: process.uptime(),
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
        heap: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
      },
    }));
    return;
  }

  // Key points extraction
  if (req.method === 'POST' && req.url === '/api/analyze/key-points') {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());

      const result = await handleKeyPoints(body);
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.body));
    } catch (err) {
      console.error('[worker] Request error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '127.0.0.1', () => {
  const mem = process.memoryUsage();
  console.log(`[worker] Analysis worker listening on :${PORT}`);
  console.log(`[worker] Memory: ${Math.round(mem.rss / 1024 / 1024)}MB RSS, ${Math.round(mem.heapUsed / 1024 / 1024)}MB heap`);
});
