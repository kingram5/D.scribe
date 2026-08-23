export interface Project {
  id: string;
  user_id: string;
  title: string;
  description: string;
  audience: Audience;
  status: "draft" | "in_progress" | "complete" | "erased";
  voice_profile: VoiceProfile | null;
  narrative_tracker: NarrativeTracker | null;
  creative_freedom?: number;
  scripture_translation?: string | null;
  /** Outline authorship: AI-accepted, user-edited, or reserved user-authored. */
  structure_provenance?: "ai_generated_accepted" | "ai_edited" | "user_authored";
  created_at: string;
  updated_at: string;
}

export type Audience =
  | "General"
  | "Academic"
  | "Faith Community"
  | "Business/Leadership"
  | "Self-Help"
  | "Young Adult";

export interface AudioUpload {
  id: string;
  project_id: string;
  file_path: string;
  file_name: string;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  status: "uploaded" | "transcribing" | "transcribed" | "failed";
  created_at: string;
}

export interface Transcript {
  id: string;
  audio_upload_id: string;
  project_id: string;
  full_text: string;
  segments: TranscriptSegment[];
  word_count: number;
  speaker_count: number;
  created_at: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  speaker: string;
  /** Word-level timings (persisted for uploads transcribed after prosody launch) */
  words?: WordTiming[];
}

export interface WordTiming {
  /** The word as transcribed */
  w: string;
  /** Start time in seconds */
  s: number;
  /** End time in seconds */
  e: number;
}

export interface VoiceProfile {
  tone: string;
  sentence_patterns: string;
  vocabulary_level: string;
  rhetorical_devices: string[];
  signature_phrases: string[];
  pacing: string;
  illustration_style: string;
  avg_sentence_length: number;
  formality_score: number;
  /** One-sentence editorial verdict on the voice. Optional: profiles built before 2026-08 lack it. */
  verdict?: string;
  /** Constructions/registers that would ring false in this voice. Same vintage caveat. */
  avoid?: string[];
}

export interface NarrativeTracker {
  themes: string[];
  covered_points: string[];
  arc_position: string;
  chapter_summaries: { chapter: number; title: string; summary: string }[];
}
