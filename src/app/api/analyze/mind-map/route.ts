import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { askClaudeWithUsage, cleanJsonLite } from "@/lib/claude-lite";
import { MIND_MAP_SYSTEM, mindMapPrompt } from "@/lib/prompts/mind-map";
import { requireAuth } from "@/lib/auth";
import { releaseInkReservation, reserveInk, settleInkReservation } from "@/lib/ink";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 60;

// POST /api/analyze/mind-map — generate concept mind map from key points
export async function POST(req: NextRequest) {
  const { user, error: authError } = await requireAuth();
  if (authError) return authError;

  const { allowed, retryAfterMs } = await checkRateLimit(user.id, "analyze");
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait before trying again." }, {
      status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
    });
  }

  const { project_id } = await req.json();
  if (!project_id) {
    return NextResponse.json({ error: "project_id required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: projectOwner } = await supabase
    .from("projects")
    .select("id")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .single();
  if (!projectOwner) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: keyPoints } = await supabase
    .from("key_points")
    .select("title, summary, tags")
    .eq("project_id", project_id);

  if (!keyPoints?.length) {
    return NextResponse.json({ mind_map: null, reason: "No key points to map" });
  }

  const inkCheck = await reserveInk(user.id, "mind_map");
  if (!inkCheck.allowed || !inkCheck.reservationId) {
    return NextResponse.json({ error: "out_of_ink", message: inkCheck.reason }, { status: 402 });
  }
  const reservationId = inkCheck.reservationId;
  let raw: string;
  let usage: { input_tokens: number; output_tokens: number };
  try {
    ({ text: raw, usage } = await askClaudeWithUsage(
      MIND_MAP_SYSTEM,
      mindMapPrompt(keyPoints),
      { model: "fast", maxTokens: 4096 }
    ));
  } catch (err) {
    await releaseInkReservation(reservationId);
    throw err;
  }

  try {
    const { nodes, edges } = JSON.parse(cleanJsonLite(raw));
    await settleInkReservation(reservationId, project_id, "mind_map", "fast", usage);

    if (nodes?.length) {
      const { error: nodesErr } = await supabase.from("mind_map_nodes").insert(
        nodes.map((n: Record<string, unknown>) => ({
          id: n.id,
          project_id,
          label: n.label,
          description: n.description || "",
          node_type: n.node_type || "subtopic",
          position_x: 0,
          position_y: 0,
          parent_id: n.parent_id || null,
          key_point_id: null,
        }))
      );
      if (nodesErr) console.error("mind_map_nodes insert failed:", nodesErr.message, nodesErr.details);
    }

    if (edges?.length) {
      const { error: edgesErr } = await supabase.from("mind_map_edges").insert(
        edges.map((e: Record<string, unknown>) => ({
          project_id,
          source_id: e.source_id,
          target_id: e.target_id,
          label: e.label || "",
          edge_type: e.edge_type || "related",
        }))
      );
      if (edgesErr) console.error("mind_map_edges insert failed:", edgesErr.message, edgesErr.details);
    }

    await supabase.from("projects").update({ status: "in_progress" }).eq("id", project_id);

    return NextResponse.json({ mind_map: { nodes: nodes?.length || 0, edges: edges?.length || 0 } });
  } catch {
    await releaseInkReservation(reservationId);
    return NextResponse.json({ mind_map: null });
  }
}
