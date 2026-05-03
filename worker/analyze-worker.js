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
    });

    start = start + chunkWords.length - overlap;
    if (start >= words.length) break;
  }

  for (const chunk of chunks) chunk.totalChunks = chunks.length;
  return chunks;
}

// ─── Prompts ──────────────────────────────────────────────────
const KEY_POINTS_SYSTEM = `You are an expert content analyst specializing in extracting key points from spoken content (sermons, lectures, keynotes, podcasts). Extract the most important, substantive points that would form the backbone of a book chapter. Focus on arguments, insights, stories, and teachings — not filler or transitions.

Return ONLY a JSON array of key point objects. No markdown, no explanation.`;

function keyPointsPrompt(chunkText, chunkIndex, totalChunks, previousTitles) {
  let prompt = `Extract key points from this transcript segment (chunk ${chunkIndex + 1} of ${totalChunks}).

Each key point should have:
- "title": A concise title (5-10 words)
- "summary": A 2-3 sentence summary of the point
- "supporting_quotes": Array of 1-3 direct quotes from the transcript that support this point
- "tags": Array of 2-4 topic tags

Return a JSON array of key point objects. Extract 3-8 key points per chunk.`;

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
    .select('id, full_text')
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
  const prompt = keyPointsPrompt(chunk.text, chunk.index, chunk.totalChunks, previous_titles || []);

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
        relevance_score: 0.8,
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
