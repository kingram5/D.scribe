import { createServerClient } from "@/lib/supabase";
import { updateJob } from "@/lib/jobs";
import { askClaude, cleanJson } from "@/lib/claude";

const BATCH_SIZE = 5;

export async function runCoherenceJob(
  jobId: string,
  input: { project_id: string }
) {
  const supabase = createServerClient();

  try {
    await updateJob(jobId, { status: "running", progress: { step: "loading" } });

    const { data: project } = await supabase
      .from("projects").select("*").eq("id", input.project_id).single();
    if (!project) throw new Error("Project not found");

    const { data: chapters } = await supabase
      .from("chapters").select("*").eq("project_id", input.project_id).order("sort_order");
    if (!chapters?.length) throw new Error("No chapters found");

    // Fetch latest content for each chapter
    const chapterBoundaries: {
      id: string;
      number: number;
      title: string;
      firstParagraph: string;
      lastParagraph: string;
    }[] = [];

    for (const ch of chapters) {
      const { data: content } = await supabase
        .from("chapter_contents")
        .select("content")
        .eq("chapter_id", ch.id)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      if (!content?.content) continue;

      const paragraphs = content.content.split(/\n\n+/).filter((p: string) => p.trim().length > 50);
      chapterBoundaries.push({
        id: ch.id,
        number: ch.chapter_number,
        title: ch.title,
        firstParagraph: paragraphs[0] || "",
        lastParagraph: paragraphs[paragraphs.length - 1] || "",
      });
    }

    if (chapterBoundaries.length < 2) {
      throw new Error("Need at least 2 chapters for coherence pass");
    }

    const voiceNote = project.voice_profile
      ? `Match this voice: ${project.voice_profile.tone || ""}, formality ${project.voice_profile.formality_score || 3}/5.`
      : "";

    // Process transitions in batches
    const allTransitions: {
      transition_index: number;
      revised_closing: string | null;
      revised_opening: string | null;
      note: string;
    }[] = [];

    const totalTransitions = chapterBoundaries.length - 1;
    const totalBatches = Math.ceil(totalTransitions / BATCH_SIZE);

    for (let batch = 0; batch < totalBatches; batch++) {
      const startIdx = batch * BATCH_SIZE;
      const endIdx = Math.min(startIdx + BATCH_SIZE, totalTransitions);
      const batchBoundaries = chapterBoundaries.slice(startIdx, endIdx + 1);

      await updateJob(jobId, {
        progress: {
          step: "coherence",
          batch: batch + 1,
          totalBatches,
          transitions: `${startIdx + 1}-${endIdx} of ${totalTransitions}`,
        },
      });

      const boundaryContext = batchBoundaries.map((ch, i) => {
        let section = `--- Chapter ${ch.number}: "${ch.title}" ---\n`;
        section += `CLOSING PARAGRAPH:\n${ch.lastParagraph}\n`;
        if (i < batchBoundaries.length - 1) {
          const next = batchBoundaries[i + 1];
          section += `\n--- Chapter ${next.number}: "${next.title}" ---\n`;
          section += `OPENING PARAGRAPH:\n${next.firstParagraph}`;
        }
        return section;
      }).join("\n\n===== TRANSITION =====\n\n");

      const raw = await askClaude(
        `You are a book editor specializing in narrative coherence and chapter transitions. ${voiceNote} Maintain the author's authentic voice while improving flow.`,
        `Review the transitions between chapters in this book. For each chapter boundary, provide revised closing and opening paragraphs that create smooth, natural transitions.

Look for:
- Thematic callbacks that could connect chapters
- Tone/energy mismatches between a chapter's ending and the next chapter's opening
- Opportunities to create anticipation or forward momentum
- Redundant phrases or ideas that appear across boundaries
- Places where a metaphor or thread could carry across chapters

Here are the chapter boundaries:

${boundaryContext}

Return a JSON array where each object has:
- transition_index: the index of the transition (0 = between the first and second chapter shown, etc.)
- revised_closing: the revised closing paragraph for the earlier chapter (or null if no change needed)
- revised_opening: the revised opening paragraph for the later chapter (or null if no change needed)
- note: brief explanation of what you changed and why

Only include transitions that need changes. If a transition is already smooth, skip it.
Return ONLY valid JSON.`,
        { maxTokens: 8192, model: "quality" }
      );

      try {
        const transitions = JSON.parse(cleanJson(raw));
        // Remap transition_index to global index
        for (const t of transitions) {
          allTransitions.push({
            ...t,
            transition_index: startIdx + t.transition_index,
          });
        }
      } catch {
        console.error(`Failed to parse coherence batch ${batch + 1}`);
      }
    }

    // Apply the transitions
    await updateJob(jobId, { progress: { step: "applying" } });
    let appliedCount = 0;

    for (const t of allTransitions) {
      const closingChapter = chapterBoundaries[t.transition_index];
      const openingChapter = chapterBoundaries[t.transition_index + 1];
      if (!closingChapter || !openingChapter) continue;

      if (t.revised_closing) {
        const { data: content } = await supabase
          .from("chapter_contents")
          .select("id, content, version")
          .eq("chapter_id", closingChapter.id)
          .order("version", { ascending: false })
          .limit(1)
          .single();

        if (content) {
          const paragraphs = content.content.split(/\n\n+/);
          paragraphs[paragraphs.length - 1] = t.revised_closing;
          const newContent = paragraphs.join("\n\n");

          await supabase.from("chapter_contents").insert({
            chapter_id: closingChapter.id,
            content: newContent,
            word_count: newContent.split(/\s+/).length,
            generation_params: { coherence_pass: true },
            version: content.version + 1,
          });
          appliedCount++;
        }
      }

      if (t.revised_opening) {
        const { data: content } = await supabase
          .from("chapter_contents")
          .select("id, content, version")
          .eq("chapter_id", openingChapter.id)
          .order("version", { ascending: false })
          .limit(1)
          .single();

        if (content) {
          const paragraphs = content.content.split(/\n\n+/);
          paragraphs[0] = t.revised_opening;
          const newContent = paragraphs.join("\n\n");

          await supabase.from("chapter_contents").insert({
            chapter_id: openingChapter.id,
            content: newContent,
            word_count: newContent.split(/\s+/).length,
            generation_params: { coherence_pass: true },
            version: content.version + 1,
          });
          appliedCount++;
        }
      }
    }

    await updateJob(jobId, {
      status: "completed",
      result: {
        transitions_found: allTransitions.length,
        chapters_updated: appliedCount,
        details: allTransitions.map((t) => t.note),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Coherence pass failed";
    await updateJob(jobId, { status: "failed", error: message });
  }
}
