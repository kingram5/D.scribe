#!/usr/bin/env node
/**
 * D.Scribe Analysis Runner — Standalone script (no HTTP server)
 *
 * Runs key points extraction directly, bypassing all web frameworks.
 * Usage: node worker/run-analysis.js <project_id> <transcript_id>
 */

const { createClient } = require('@supabase/supabase-js');
const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

// Load env
const envPath = join(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    if (!process.env[t.slice(0, eq).trim()]) process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const [projectId, transcriptId] = process.argv.slice(2);
if (!projectId || !transcriptId) {
  console.error('Usage: node worker/run-analysis.js <project_id> <transcript_id>');
  process.exit(1);
}

// Claude API
async function askClaude(system, userMessage, opts = {}) {
  const models = { fast: 'claude-haiku-4-5-20251001', quality: 'claude-sonnet-4-20250514' };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: models[opts.model || 'quality'],
      max_tokens: opts.maxTokens || 8192,
      temperature: opts.temperature || 0.6,
      system,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.content?.[0]?.type === 'text' ? data.content[0].text : '';
}

function cleanJson(raw) {
  let s = raw.trim();
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```[\s\S]*$/, '');
  s = s.trim();
  if (s[0] === '[' || s[0] === '{') {
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

// Chunker
function chunkTranscript(text) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 3000) return [{ text, wordCount: words.length, index: 0, totalChunks: 1 }];
  const chunks = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + 3000, words.length);
    const cw = words.slice(start, end);
    chunks.push({ text: cw.join(' '), wordCount: cw.length, index: chunks.length, totalChunks: 0 });
    start = start + cw.length - 200;
    if (start >= words.length) break;
  }
  for (const c of chunks) c.totalChunks = chunks.length;
  return chunks;
}

const KEY_POINTS_SYSTEM = `You are an expert content analyst. Extract key points from spoken content. Return ONLY a JSON array of objects with: title, summary, supporting_quotes (array), tags (array).`;

async function main() {
  console.log(`[run] Starting analysis for project ${projectId}`);
  console.log(`[run] Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);

  // Load transcript
  const { data: tx, error } = await supabase
    .from('transcripts').select('id, full_text, word_count')
    .eq('id', transcriptId).eq('project_id', projectId).single();

  if (error || !tx) { console.error('[run] Transcript not found:', error?.message); process.exit(1); }
  console.log(`[run] Transcript loaded: ${tx.word_count} words, ${tx.full_text.length} chars`);

  // Clear old key points
  await supabase.from('key_points').delete().eq('project_id', projectId).eq('transcript_id', transcriptId);
  console.log('[run] Cleared old key points');

  // Chunk and process
  const chunks = chunkTranscript(tx.full_text);
  console.log(`[run] Split into ${chunks.length} chunks`);

  const allKeyPoints = [];

  for (const chunk of chunks) {
    console.log(`[run] Processing chunk ${chunk.index + 1}/${chunk.totalChunks} (${chunk.wordCount} words)`);
    console.log(`[run] Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);

    const previousTitles = allKeyPoints.map(kp => kp.title);
    let prompt = `Extract key points from this transcript segment (chunk ${chunk.index + 1} of ${chunk.totalChunks}).
Each key point: title (5-10 words), summary (2-3 sentences), supporting_quotes (1-3 direct quotes), tags (2-4 topics).
Return 3-8 key points as a JSON array.`;
    if (previousTitles.length > 0) prompt += `\n\nAlready extracted (avoid duplicates):\n${previousTitles.map(t => '- ' + t).join('\n')}`;
    prompt += `\n\nTranscript:\n"""\n${chunk.text}\n"""`;

    try {
      const raw = await askClaude(KEY_POINTS_SYSTEM, prompt, { model: 'fast', maxTokens: 4096 });
      const kps = JSON.parse(cleanJson(raw));
      allKeyPoints.push(...kps);
      console.log(`[run] Got ${kps.length} key points from chunk ${chunk.index + 1}`);
    } catch (err) {
      console.error(`[run] Chunk ${chunk.index + 1} failed:`, err.message);
    }
  }

  // Save all key points
  if (allKeyPoints.length > 0) {
    const { error: insertErr } = await supabase.from('key_points').insert(
      allKeyPoints.map(kp => ({
        project_id: projectId,
        transcript_id: transcriptId,
        title: kp.title,
        summary: kp.summary,
        supporting_quotes: kp.supporting_quotes || [],
        tags: kp.tags || [],
        relevance_score: 0.8,
      }))
    );
    if (insertErr) console.error('[run] Insert error:', insertErr.message);
    else console.log(`[run] Saved ${allKeyPoints.length} key points to database`);
  }

  console.log(`[run] Analysis complete! ${allKeyPoints.length} total key points`);
  console.log(`[run] Final memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`);

  // Output result as JSON for the caller
  console.log(JSON.stringify({ success: true, key_points_count: allKeyPoints.length }));
}

main().then(() => process.exit(0)).catch(err => {
  console.error('[run] Fatal:', err.message);
  process.exit(1);
});
