#!/usr/bin/env node
/**
 * Standalone pipeline runner — bypasses Next.js to avoid OOM issues.
 * Usage: node scripts/run-pipeline.mjs <project_id> [stage]
 * Stages: analyze, outline, generate, all (default: all)
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const HAIKU = "claude-haiku-4-5-20251001";
const SONNET = "claude-sonnet-4-20250514";

function cleanJson(raw) {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return s.trim();
}

async function ask(model, system, user, maxTokens = 4096, temperature = 0.6) {
  const res = await claude.messages.create({
    model, max_tokens: maxTokens, temperature, system,
    messages: [{ role: "user", content: user }],
  });
  return res.content[0]?.type === "text" ? res.content[0].text : "";
}

// ── ANALYZE ──────────────────────────────────────────────
async function runAnalyze(projectId) {
  console.log("\n── ANALYZE ──");

  const { data: transcripts } = await sb
    .from("transcripts").select("*").eq("project_id", projectId);

  if (!transcripts?.length) { console.log("No transcripts found."); return; }

  const { data: project } = await sb
    .from("projects").select("voice_profile").eq("id", projectId).single();

  for (const tx of transcripts) {
    console.log(`Transcript: ${tx.id} (${tx.full_text.split(/\s+/).length} words)`);

    // Key points
    console.log("  Extracting key points (Haiku)...");
    const kpRaw = await ask(HAIKU,
      "You extract key points from sermon/lecture transcripts. Return a JSON array of objects with: title, summary, supporting_quotes (array of short quotes), tags (array). Return ONLY valid JSON, no markdown.",
      "Extract 5-10 key points from this transcript:\n\n" + tx.full_text,
      4096
    );
    let keyPoints = [];
    try { keyPoints = JSON.parse(cleanJson(kpRaw)); } catch (e) { console.log("  ⚠ Key points parse error:", e.message); }
    console.log(`  ${keyPoints.length} key points extracted`);

    if (keyPoints.length > 0) {
      // Clear old key points
      await sb.from("key_points").delete().eq("transcript_id", tx.id);
      const { error } = await sb.from("key_points").insert(keyPoints.map(kp => ({
        project_id: projectId, transcript_id: tx.id,
        title: kp.title, summary: kp.summary,
        supporting_quotes: kp.supporting_quotes || [], tags: kp.tags || [],
        relevance_score: 0.8,
      })));
      if (error) console.log("  ⚠ DB error:", error.message);
      else console.log("  ✓ Key points saved");
    }

    // Voice profile
    console.log("  Generating voice profile (Haiku)...");
    const words = tx.full_text.split(/\s+/);
    const sample = words.slice(0, 1000).join(" ");
    const vpRaw = await ask(HAIKU,
      "You are a linguistic analyst specializing in speaker/author voice profiling. Analyze speaking patterns to create a replicable style guide. Return ONLY valid JSON, no markdown.",
      `Analyze the voice in this transcript excerpt and return JSON with these exact fields:
- tone: Overall emotional/rhetorical tone (2-4 descriptors)
- sentence_patterns: How sentences are typically structured
- vocabulary_level: Complexity and register of word choice
- rhetorical_devices: array of specific devices used (strings)
- signature_phrases: array of recurring phrases (exact quotes)
- pacing: How ideas build within a section
- illustration_style: How examples and metaphors are used
- avg_sentence_length: Estimated average in words (number)
- formality_score: 1-5 scale (number, 1=casual, 5=formal)

Transcript:\n\n` + sample, 2048
    );
    try {
      const vp = JSON.parse(cleanJson(vpRaw));
      await sb.from("projects").update({ voice_profile: vp }).eq("id", projectId);
      console.log("  ✓ Voice profile saved");
    } catch { console.log("  ⚠ Voice profile parse error"); }

    // Mind map
    if (keyPoints.length > 0) {
      console.log("  Generating mind map (Haiku)...");
      const mmRaw = await ask(HAIKU,
        "Create a mind map from key points. Return JSON: { nodes: [{id, label, description, node_type, parent_id}], edges: [{source_id, target_id, label, edge_type}] }. Root node_type is \"central\". Return ONLY valid JSON.",
        "Create mind map:\n\n" + JSON.stringify(keyPoints.map(k => ({ title: k.title, summary: k.summary, tags: k.tags }))),
        4096
      );
      try {
        const mm = JSON.parse(cleanJson(mmRaw));
        // Clear old mind map
        await sb.from("mind_map_edges").delete().eq("project_id", projectId);
        await sb.from("mind_map_nodes").delete().eq("project_id", projectId);
        if (mm.nodes?.length) {
          await sb.from("mind_map_nodes").insert(mm.nodes.map(n => ({
            id: n.id, project_id: projectId, label: n.label,
            description: n.description || "", node_type: n.node_type || "subtopic",
            position_x: 0, position_y: 0, parent_id: n.parent_id || null, key_point_id: null,
          })));
        }
        if (mm.edges?.length) {
          await sb.from("mind_map_edges").insert(mm.edges.map(e => ({
            project_id: projectId, source_id: e.source_id, target_id: e.target_id,
            label: e.label || "", edge_type: e.edge_type || "related",
          })));
        }
        console.log(`  ✓ Mind map saved (${mm.nodes?.length || 0} nodes, ${mm.edges?.length || 0} edges)`);
      } catch { console.log("  ⚠ Mind map parse error"); }
    }
  }

  await sb.from("projects").update({ status: "in_progress" }).eq("id", projectId);
  console.log("✓ Analysis complete");
}

// ── OUTLINE ──────────────────────────────────────────────
async function runOutline(projectId) {
  console.log("\n── OUTLINE ──");

  const { data: project } = await sb.from("projects").select("*").eq("id", projectId).single();
  const { data: keyPoints } = await sb.from("key_points").select("*").eq("project_id", projectId).order("created_at");

  if (!keyPoints?.length) { console.log("No key points. Run analyze first."); return; }

  const numChapters = Math.max(3, Math.ceil(keyPoints.length / 3));
  console.log(`  ${keyPoints.length} key points → ${numChapters} chapters (Sonnet)...`);

  const raw = await ask(SONNET,
    "You create book chapter outlines from key points. Return a JSON array of objects with: title, summary, key_point_ids (array of 1-based indices into the key points list). Return ONLY valid JSON.",
    `Create ${numChapters} chapter outlines for a ${project.audience || "General"} audience book titled "${project.title}" from these key points:\n\n` +
    keyPoints.map((kp, i) => `${i + 1}. ${kp.title}: ${kp.summary}`).join("\n"),
    4096, 0.5
  );

  try {
    const chapters = JSON.parse(cleanJson(raw));
    await sb.from("chapters").delete().eq("project_id", projectId);
    const { data: inserted, error } = await sb.from("chapters").insert(
      chapters.map((ch, i) => ({
        project_id: projectId, chapter_number: i + 1,
        title: ch.title, summary: ch.summary,
        key_point_ids: (ch.key_point_ids || []).map(idx => keyPoints[idx - 1]?.id).filter(Boolean),
        target_word_count: 3000, sort_order: i,
      }))
    ).select();
    if (error) throw error;
    console.log(`✓ ${inserted.length} chapters created`);
    return inserted;
  } catch (e) { console.log("⚠ Outline error:", e.message); }
}

// ── GENERATE ─────────────────────────────────────────────
async function runGenerate(projectId) {
  console.log("\n── GENERATE ──");

  const { data: project } = await sb.from("projects").select("*").eq("id", projectId).single();
  const { data: chapters } = await sb.from("chapters").select("*").eq("project_id", projectId).order("chapter_number");
  const { data: transcripts } = await sb.from("transcripts").select("full_text").eq("project_id", projectId);
  const fullText = (transcripts || []).map(t => t.full_text).join("\n\n");

  if (!chapters?.length) { console.log("No chapters. Run outline first."); return; }

  let previousTail = "";

  for (const ch of chapters) {
    console.log(`  Chapter ${ch.chapter_number}: "${ch.title}" (Sonnet)...`);

    const { data: keyPoints } = await sb.from("key_points").select("*").in("id", ch.key_point_ids || []);
    const kpContext = (keyPoints || []).map(kp => `- ${kp.title}: ${kp.summary}`).join("\n");

    const voiceNote = project.voice_profile
      ? `\nMatch this voice: ${project.voice_profile.tone || ""}, formality ${project.voice_profile.formality_score || 3}/5.`
      : "";

    let tailContext = "";
    if (previousTail) {
      tailContext = `\n\nEnd of Previous Chapter (continue the flow naturally from here — match the energy and create a smooth transition):\n---\n...${previousTail}\n---`;
    }

    const content = await ask(SONNET,
      `You are a skilled book ghostwriter. Write in the speaker's authentic voice.${voiceNote} Write engaging, readable prose suitable for a ${project.audience || "General"} audience.`,
      `Write Chapter ${ch.chapter_number}: "${ch.title}"\n\nSummary: ${ch.summary}\n\nKey points to cover:\n${kpContext}\n\nSource transcript excerpt:\n${fullText.slice(0, 4000)}\n\nTarget: ~${ch.target_word_count || 3000} words.${tailContext}\n\nWrite the full chapter now.`,
      16384, 0.6
    );

    // Store tail for next chapter
    const words = content.split(/\s+/);
    previousTail = words.slice(-500).join(" ");

    const wordCount = content.split(/\s+/).length;

    // Get next version
    const { data: existing } = await sb.from("chapter_contents")
      .select("version").eq("chapter_id", ch.id).order("version", { ascending: false }).limit(1);
    const nextVersion = (existing?.[0]?.version || 0) + 1;

    const { error } = await sb.from("chapter_contents").insert({
      chapter_id: ch.id, content, word_count: wordCount,
      generation_params: { creative_freedom: 50, audience: project.audience, target_words: ch.target_word_count },
      version: nextVersion,
    });
    if (error) console.log(`  ⚠ Save error:`, error.message);
    else console.log(`  ✓ ${wordCount} words saved (v${nextVersion})`);

    await sb.from("chapters").update({ status: "generated" }).eq("id", ch.id);
  }

  console.log("✓ All chapters generated");
}

// ── COHERENCE ────────────────────────────────────────────
async function runCoherence(projectId) {
  console.log("\n── COHERENCE PASS ──");

  const { data: chapters } = await sb.from("chapters").select("*").eq("project_id", projectId).order("sort_order");
  if (!chapters?.length || chapters.length < 2) { console.log("Need 2+ chapters."); return; }

  const { data: project } = await sb.from("projects").select("voice_profile").eq("id", projectId).single();

  // Collect boundaries
  const boundaries = [];
  for (const ch of chapters) {
    const { data: content } = await sb.from("chapter_contents")
      .select("content").eq("chapter_id", ch.id).order("version", { ascending: false }).limit(1).single();
    if (!content?.content) continue;
    const paras = content.content.split(/\n\n+/).filter(p => p.trim().length > 50);
    boundaries.push({
      id: ch.id, number: ch.chapter_number, title: ch.title,
      first: paras[0] || "", last: paras[paras.length - 1] || "",
    });
  }

  if (boundaries.length < 2) { console.log("Not enough content for coherence pass."); return; }

  const context = boundaries.map((ch, i) => {
    let s = `--- Ch ${ch.number}: "${ch.title}" ---\nCLOSING:\n${ch.last}\n`;
    if (i < boundaries.length - 1) {
      const next = boundaries[i + 1];
      s += `\n--- Ch ${next.number}: "${next.title}" ---\nOPENING:\n${next.first}`;
    }
    return s;
  }).join("\n\n===== TRANSITION =====\n\n");

  const voiceNote = project?.voice_profile
    ? `Match voice: ${project.voice_profile.tone || ""}, formality ${project.voice_profile.formality_score || 3}/5.`
    : "";

  console.log(`  Reviewing ${boundaries.length - 1} transitions (Sonnet)...`);

  const raw = await ask(SONNET,
    `You are a book editor specializing in narrative coherence. ${voiceNote} Maintain the author's voice.`,
    `Review transitions between chapters. For each boundary, provide revised closing/opening paragraphs for smooth flow.

Look for: thematic callbacks, tone mismatches, redundancy, opportunities for forward momentum.

${context}

Return JSON array: [{transition_index, revised_closing (or null), revised_opening (or null), note}]. Only include transitions needing changes. Return ONLY valid JSON.`,
    8192, 0.5
  );

  let transitions = [];
  try { transitions = JSON.parse(cleanJson(raw)); } catch { console.log("  ⚠ Parse error"); return; }

  console.log(`  ${transitions.length} transitions to improve`);

  for (const t of transitions) {
    const closing = boundaries[t.transition_index];
    const opening = boundaries[t.transition_index + 1];
    if (!closing || !opening) continue;

    if (t.revised_closing) {
      const { data: c } = await sb.from("chapter_contents")
        .select("content, version").eq("chapter_id", closing.id).order("version", { ascending: false }).limit(1).single();
      if (c) {
        const paras = c.content.split(/\n\n+/);
        paras[paras.length - 1] = t.revised_closing;
        const nc = paras.join("\n\n");
        await sb.from("chapter_contents").insert({
          chapter_id: closing.id, content: nc, word_count: nc.split(/\s+/).length,
          generation_params: { coherence_pass: true }, version: c.version + 1,
        });
      }
    }
    if (t.revised_opening) {
      const { data: c } = await sb.from("chapter_contents")
        .select("content, version").eq("chapter_id", opening.id).order("version", { ascending: false }).limit(1).single();
      if (c) {
        const paras = c.content.split(/\n\n+/);
        paras[0] = t.revised_opening;
        const nc = paras.join("\n\n");
        await sb.from("chapter_contents").insert({
          chapter_id: opening.id, content: nc, word_count: nc.split(/\s+/).length,
          generation_params: { coherence_pass: true }, version: c.version + 1,
        });
      }
    }
    console.log(`  ✓ ${t.note}`);
  }

  console.log("✓ Coherence pass complete");
}

// ── MAIN ─────────────────────────────────────────────────
const projectId = process.argv[2];
const stage = process.argv[3] || "all";

if (!projectId) {
  console.log("Usage: node scripts/run-pipeline.mjs <project_id> [analyze|outline|generate|coherence|all]");
  process.exit(1);
}

console.log(`Pipeline: ${stage} | Project: ${projectId}`);

try {
  if (stage === "analyze" || stage === "all") await runAnalyze(projectId);
  if (stage === "outline" || stage === "all") await runOutline(projectId);
  if (stage === "generate" || stage === "all") await runGenerate(projectId);
  if (stage === "coherence" || stage === "all") await runCoherence(projectId);
  console.log("\n🏁 Pipeline complete!");
} catch (e) {
  console.error("FATAL:", e.message);
  process.exit(1);
}
