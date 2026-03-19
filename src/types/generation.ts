import { Audience } from "./project";

export interface Chapter {
  id: string;
  project_id: string;
  chapter_number: number;
  title: string;
  summary: string;
  key_point_ids: string[];
  blended_key_point_ids?: string[];
  target_word_count: number;
  status: "outlined" | "generating" | "generated" | "edited";
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ChapterContent {
  id: string;
  chapter_id: string;
  content: string;
  word_count: number;
  generation_params: GenerationParams;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface GenerationParams {
  creative_freedom: number; // 0-100, maps to temperature 0.3-0.9
  audience: Audience;
  target_words: number;
  include_enrichments: boolean;
}

export interface Enrichment {
  id: string;
  chapter_id: string;
  quote_text: string;
  source_author: string;
  source_title: string;
  source_type: "book" | "article" | "scripture" | "speech" | "research";
  relevance_note: string;
  included: boolean;
  created_at: string;
}
