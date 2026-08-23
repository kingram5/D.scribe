export interface Project {
  id: string;
  user_id: string;
  title: string;
  description: string;
  audience: Audience;
  status: "draft" | "in_progress" | "complete" | "erased";
  voice_profile: VoiceProfile | null;
  narrative_tracker: NarrativeTracker | null;
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
}

export interface NarrativeTracker {
  themes: string[];
  covered_points: string[];
  arc_position: string;
  chapter_summaries: { chapter: number; title: string; summary: string }[];
}
