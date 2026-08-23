import { createServerClient } from "@/lib/supabase";
import { DISCLAIMER_LINE } from "@/lib/copyright-readiness";

export interface EvidenceTranscript {
  id: string;
  full_text: string;
  word_count: number;
  created_at: string;
  kind: "interview" | "brainstorm";
  source_name: string;
}

export interface EvidenceEditEvent {
  chapter_id: string;
  chapter_number: number;
  chapter_title: string;
  kind: string;
  created_at: string;
  instruction: string;
  before_text: string;
  after_text: string;
}

export interface EvidenceVersion {
  chapter_id: string;
  chapter_number: number;
  chapter_title: string;
  version: number;
  word_count: number;
  created_at: string;
  source: string;
}

export interface EvidenceBundle {
  title: string;
  generatedAt: Date;
  transcripts: EvidenceTranscript[];
  edits: EvidenceEditEvent[];
  versions: EvidenceVersion[];
}

export function coverPageLine(title: string, generatedAt: Date): string {
  const date = generatedAt.toISOString().slice(0, 10);
  return `Authorship evidence for ${title}, generated ${date} — retain with your records.`;
}

function versionSource(params: Record<string, unknown> | null | undefined): string {
  if (!params) return "unknown";
  if (params.manual_edit) return "manual_edit";
  if (params.rewrite) return typeof params.rewrite_mode === "string" ? params.rewrite_mode : "rewrite";
  if (params.coherence_pass) return "coherence_pass";
  return "generation";
}

/** Ownership-checked load. Returns null when the project is not the user's. */
export async function loadEvidenceForProject(
  projectId: string,
  userId: string
): Promise<EvidenceBundle | null> {
  const supabase = createServerClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, title")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();
  if (!project) return null;

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, chapter_number, title")
    .eq("project_id", projectId)
    .order("sort_order");

  const chapterList = chapters ?? [];
  const chapterIds = chapterList.map((ch) => ch.id);
  const chapterMeta = new Map(
    chapterList.map((ch) => [ch.id, { number: ch.chapter_number, title: ch.title }])
  );

  const [{ data: transcripts }, { data: uploads }, { data: events }, { data: contents }] =
    await Promise.all([
      supabase
        .from("transcripts")
        .select("id, full_text, word_count, created_at, audio_upload_id")
        .eq("project_id", projectId)
        .order("created_at"),
      supabase
        .from("audio_uploads")
        .select("id, file_name")
        .eq("project_id", projectId),
      chapterIds.length
        ? supabase
            .from("edit_events")
            .select("chapter_id, kind, created_at, instruction, before_text, after_text")
            .eq("project_id", projectId)
            .in("chapter_id", chapterIds)
            .order("created_at")
        : Promise.resolve({ data: [] as never[] }),
      chapterIds.length
        ? supabase
            .from("chapter_contents")
            .select("chapter_id, version, word_count, created_at, generation_params")
            .in("chapter_id", chapterIds)
            .order("version")
        : Promise.resolve({ data: [] as never[] }),
    ]);

  const brainstormUploads = new Set(
    (uploads ?? [])
      .filter((u) => String(u.file_name || "").startsWith("brainstorm-"))
      .map((u) => u.id)
  );
  const uploadName = new Map((uploads ?? []).map((u) => [u.id, u.file_name || "upload"]));

  const evidenceTranscripts: EvidenceTranscript[] = (transcripts ?? []).map((t) => {
    const brainstorm = brainstormUploads.has(t.audio_upload_id);
    return {
      id: t.id,
      full_text: t.full_text ?? "",
      word_count: t.word_count ?? 0,
      created_at: t.created_at,
      kind: brainstorm ? "brainstorm" : "interview",
      source_name: uploadName.get(t.audio_upload_id) || (brainstorm ? "brainstorm" : "transcript"),
    };
  });

  const edits: EvidenceEditEvent[] = (events ?? []).map((e) => {
    const meta = chapterMeta.get(e.chapter_id);
    return {
      chapter_id: e.chapter_id,
      chapter_number: meta?.number ?? 0,
      chapter_title: meta?.title ?? "",
      kind: e.kind ?? "",
      created_at: e.created_at,
      instruction: e.instruction ?? "",
      before_text: e.before_text ?? "",
      after_text: e.after_text ?? "",
    };
  });

  const versions: EvidenceVersion[] = (contents ?? []).map((c) => {
    const meta = chapterMeta.get(c.chapter_id);
    return {
      chapter_id: c.chapter_id,
      chapter_number: meta?.number ?? 0,
      chapter_title: meta?.title ?? "",
      version: c.version,
      word_count: c.word_count ?? 0,
      created_at: c.created_at,
      source: versionSource(c.generation_params),
    };
  });

  return {
    title: project.title || "Untitled",
    generatedAt: new Date(),
    transcripts: evidenceTranscripts,
    edits,
    versions,
  };
}

export async function generateEvidencePDF(bundle: EvidenceBundle): Promise<Buffer> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 72;
  const textWidth = pageWidth - margin * 2;
  const fontSize = 11;
  const lineSpacing = fontSize * 1.45;
  let y = margin;

  const newPage = () => {
    doc.addPage();
    y = margin;
  };

  const ensure = (needed = lineSpacing) => {
    if (y + needed > pageHeight - margin) newPage();
  };

  const write = (text: string, opts?: { bold?: boolean; size?: number; color?: [number, number, number] }) => {
    const size = opts?.size ?? fontSize;
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal");
    doc.setFontSize(size);
    if (opts?.color) doc.setTextColor(...opts.color);
    else doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(text || " ", textWidth) as string[];
    for (const line of lines) {
      ensure(size * 1.45);
      doc.text(line, margin, y);
      y += size * 1.45;
    }
  };

  const heading = (text: string) => {
    y += 10;
    write(text, { bold: true, size: 16 });
    y += 6;
  };

  const rule = () => {
    ensure(16);
    doc.setDrawColor(193, 122, 71);
    doc.line(margin, y, pageWidth - margin, y);
    y += 16;
  };

  // Cover
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(30, 30, 30);
  const cover = coverPageLine(bundle.title, bundle.generatedAt);
  const coverLines = doc.splitTextToSize(cover, textWidth) as string[];
  y = 240;
  for (const line of coverLines) {
    doc.text(line, pageWidth / 2, y, { align: "center" });
    y += 28;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(100, 100, 100);
  doc.text(DISCLAIMER_LINE, pageWidth / 2, y + 24, { align: "center" });
  doc.text("Copyright Readiness evidence bundle", pageWidth / 2, y + 42, { align: "center" });

  // Interview transcripts
  newPage();
  heading("Interview transcripts");
  write("Full transcript text from this project. Used as the spoken source for the manuscript.");
  y += 8;
  const interviews = bundle.transcripts.filter((t) => t.kind === "interview");
  if (interviews.length === 0) {
    write("No interview transcripts on this project.");
  } else {
    for (const t of interviews) {
      rule();
      write(`${t.source_name} · ${t.word_count} words · ${t.created_at}`, { bold: true, size: 10 });
      y += 4;
      write(t.full_text || "(empty)");
    }
  }

  // Brainstorm
  heading("Brainstorm conversation");
  write("Same source the brainstorm studio persists (labeled AUTHOR / INTERVIEWER transcript).");
  y += 8;
  const brainstorms = bundle.transcripts.filter((t) => t.kind === "brainstorm");
  if (brainstorms.length === 0) {
    write("No brainstorm conversation saved on this project.");
  } else {
    for (const t of brainstorms) {
      rule();
      write(`${t.source_name} · ${t.word_count} words · ${t.created_at}`, { bold: true, size: 10 });
      y += 4;
      write(t.full_text || "(empty)");
    }
  }

  // Edit events
  heading("Per-chapter edit history");
  write("edit_events: kind, timestamp, instruction, and before/after text.");
  y += 8;
  if (bundle.edits.length === 0) {
    write("No edit events recorded.");
  } else {
    for (const e of bundle.edits) {
      rule();
      write(
        `Chapter ${e.chapter_number} · ${e.chapter_title} · ${e.kind} · ${e.created_at}`,
        { bold: true, size: 10 }
      );
      if (e.instruction) write(`Instruction: ${e.instruction}`);
      write("Before:", { bold: true, size: 10 });
      write(e.before_text || "(empty)");
      write("After:", { bold: true, size: 10 });
      write(e.after_text || "(empty)");
    }
  }

  // Version metadata
  heading("Chapter version history (metadata)");
  write("chapter_contents versions — word counts and source, not full chapter prose.");
  y += 8;
  if (bundle.versions.length === 0) {
    write("No chapter versions yet.");
  } else {
    for (const v of bundle.versions) {
      ensure(lineSpacing);
      write(
        `Chapter ${v.chapter_number} · ${v.chapter_title} · v${v.version} · ${v.word_count} words · ${v.source} · ${v.created_at}`,
        { size: 10 }
      );
    }
  }

  return Buffer.from(doc.output("arraybuffer"));
}
