export interface KeyPoint {
  id: string;
  project_id: string;
  transcript_id: string | null;
  title: string;
  summary: string;
  supporting_quotes: string[];
  tags: string[];
  relevance_score: number;
  covered_in_chapter: string | null;
  created_at: string;
}

export interface MindMapNode {
  id: string;
  project_id: string;
  label: string;
  description: string;
  node_type: "topic" | "subtopic" | "quote" | "scripture" | "illustration";
  position_x: number;
  position_y: number;
  parent_id: string | null;
  key_point_id: string | null;
}

export interface MindMapEdge {
  id: string;
  project_id: string;
  source_id: string;
  target_id: string;
  label: string;
  edge_type: "related" | "supports" | "contradicts" | "leads_to";
}
