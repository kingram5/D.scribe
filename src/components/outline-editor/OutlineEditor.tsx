"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type NodeChange,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Chapter, KeyPoint } from "@/types";
import { useOutlineState } from "./useOutlineState";
import { buildNodesAndEdges, applyDagreLayout, type OutlineNode } from "./layout";
import { ChapterNode } from "./ChapterNode";
import { KeyPointNode } from "./KeyPointNode";
import { EditorToolbar } from "./EditorToolbar";

interface OutlineEditorProps {
  projectId: string;
  initialChapters: Chapter[];
  initialKeyPoints: KeyPoint[];
  onContinue: () => void;
}

const nodeTypes = {
  chapter: ChapterNode,
  keyPoint: KeyPointNode,
};

function OutlineEditorInner({
  projectId,
  initialChapters,
  initialKeyPoints,
  onContinue,
}: OutlineEditorProps) {
  const { state, dispatch, undo, redo, canUndo, canRedo } = useOutlineState();
  const { getIntersectingNodes } = useReactFlow();
  const [nodes, setNodes] = useState<OutlineNode[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [confirmCombine, setConfirmCombine] = useState<{
    sourceId: string;
    targetId: string;
    type: "keyPoint" | "chapter";
    position: { x: number; y: number };
  } | null>(null);

  // Initialize state
  useEffect(() => {
    if (initialChapters.length > 0 || initialKeyPoints.length > 0) {
      dispatch({ type: "INIT", chapters: initialChapters, keyPoints: initialKeyPoints });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild nodes/edges when state changes
  useEffect(() => {
    const { nodes: rawNodes, edges: newEdges } = buildNodesAndEdges(state.chapters, state.keyPoints);

    // Inject callbacks into node data
    const nodesWithCallbacks = rawNodes.map((node) => {
      if (node.type === "chapter" && node.data.chapter) {
        const ch = node.data.chapter;
        return {
          ...node,
          data: {
            ...node.data,
            onEdit: (field: "title" | "summary", value: string) => {
              dispatch({ type: "EDIT_CHAPTER", chapterId: ch.id, field, value });
            },
            onDelete: () => {
              dispatch({ type: "DELETE_CHAPTER", chapterId: ch.id });
            },
          },
        };
      }
      if (node.type === "keyPoint" && node.data.keyPoint) {
        const kp = node.data.keyPoint;
        return {
          ...node,
          data: {
            ...node.data,
            onEdit: (field: "title" | "summary", value: string) => {
              dispatch({ type: "EDIT_KEY_POINT", keyPointId: kp.id, field, value });
            },
            onDelete: () => {
              dispatch({ type: "DELETE_KEY_POINT", keyPointId: kp.id });
            },
          },
        };
      }
      return node;
    });

    const laid = applyDagreLayout(nodesWithCallbacks, newEdges);
    setNodes(laid);
    setEdges(newEdges);
  }, [state.chapters, state.keyPoints, dispatch]);

  // Debounced auto-save
  useEffect(() => {
    if (!state.dirty) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      try {
        // Save chapters
        for (const ch of state.chapters) {
          await fetch(`/api/project/${projectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chapter_id: ch.id,
              title: ch.title,
              summary: ch.summary,
              key_point_ids: ch.key_point_ids,
              target_word_count: ch.target_word_count,
              sort_order: ch.sort_order,
              chapter_number: ch.chapter_number,
            }),
          });
        }
        // Save key points
        for (const kp of state.keyPoints) {
          await fetch(`/api/project/${projectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              key_point_id: kp.id,
              title: kp.title,
              summary: kp.summary,
            }),
          });
        }
        dispatch({ type: "MARK_CLEAN" });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
      }
    }, 1500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state.dirty, state.chapters, state.keyPoints, projectId, dispatch]);

  // Handle node position changes (manual drag)
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) =>
      nds.map((node) => {
        const change = changes.find(
          (c) => c.type === "position" && "id" in c && c.id === node.id
        );
        if (change && change.type === "position" && "position" in change && change.position) {
          return { ...node, position: change.position };
        }
        return node;
      })
    );
  }, []);

  // Handle drag stop — detect combine or move interactions
  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const intersecting = getIntersectingNodes(node);
      if (intersecting.length === 0) return;

      const target = intersecting[0];
      const sourceIsKp = node.id.startsWith("kp-");
      const targetIsKp = target.id.startsWith("kp-");
      const sourceIsCh = node.id.startsWith("ch-");
      const targetIsCh = target.id.startsWith("ch-");

      const sourceRealId = node.id.replace(/^(ch-|kp-)/, "");
      const targetRealId = target.id.replace(/^(ch-|kp-)/, "");

      // Key point → Chapter (move to that chapter)
      if (sourceIsKp && targetIsCh) {
        const sourceChapter = state.chapters.find((ch) =>
          ch.key_point_ids.includes(sourceRealId)
        );
        if (sourceChapter && sourceChapter.id !== targetRealId) {
          dispatch({
            type: "MOVE_KEY_POINT",
            keyPointId: sourceRealId,
            fromChapterId: sourceChapter.id,
            toChapterId: targetRealId,
          });
        }
        return;
      }

      // Key point → Key point (combine)
      if (sourceIsKp && targetIsKp && sourceRealId !== targetRealId) {
        setConfirmCombine({
          sourceId: sourceRealId,
          targetId: targetRealId,
          type: "keyPoint",
          position: { x: node.position.x + 100, y: node.position.y },
        });
        return;
      }

      // Chapter → Chapter (combine)
      if (sourceIsCh && targetIsCh && sourceRealId !== targetRealId) {
        setConfirmCombine({
          sourceId: sourceRealId,
          targetId: targetRealId,
          type: "chapter",
          position: { x: node.position.x + 120, y: node.position.y },
        });
        return;
      }
    },
    [getIntersectingNodes, state.chapters, dispatch]
  );

  function handleConfirmCombine() {
    if (!confirmCombine) return;
    if (confirmCombine.type === "keyPoint") {
      dispatch({
        type: "COMBINE_KEY_POINTS",
        targetId: confirmCombine.targetId,
        sourceId: confirmCombine.sourceId,
      });
    } else {
      dispatch({
        type: "COMBINE_CHAPTERS",
        targetId: confirmCombine.targetId,
        sourceId: confirmCombine.sourceId,
      });
    }
    setConfirmCombine(null);
  }

  function handleAutoLayout() {
    const { nodes: rawNodes, edges: newEdges } = buildNodesAndEdges(state.chapters, state.keyPoints);
    const laid = applyDagreLayout(rawNodes, newEdges);
    // Re-inject callbacks
    setNodes(laid.map((node) => {
      const existing = nodes.find((n) => n.id === node.id);
      return existing ? { ...node, data: existing.data } : node;
    }));
  }

  const miniMapNodeColor = useCallback((node: Node) => {
    return node.type === "chapter" ? "#191816" : "#b45309";
  }, []);

  return (
    <div style={{ width: "100%", height: "calc(100vh - 160px)", position: "relative" }}>
      <EditorToolbar
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        onAutoLayout={handleAutoLayout}
        onAddChapter={() => dispatch({ type: "ADD_CHAPTER" })}
        saveStatus={saveStatus}
        onContinue={onContinue}
        hasChapters={state.chapters.length > 0}
      />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        style={{
          background: "linear-gradient(135deg, #f5f0e8 0%, #ebe4d8 100%)",
          borderRadius: "0 0 12px 12px",
        }}
      >
        <Background color="rgba(0,0,0,0.04)" gap={24} />
        <Controls
          showInteractive={false}
          style={{ borderRadius: 8, border: "1px solid rgba(0,0,0,0.08)" }}
        />
        <MiniMap
          nodeColor={miniMapNodeColor}
          style={{
            background: "#191816",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        />
      </ReactFlow>

      {/* Combine confirmation popover */}
      {confirmCombine && (
        <div style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          padding: "16px 24px",
          background: "white",
          borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          border: "1px solid rgba(0,0,0,0.1)",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 12,
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#191816" }}>
            Combine these {confirmCombine.type === "chapter" ? "chapters" : "key points"}?
          </div>
          <div style={{ fontSize: 12, color: "#7a7369" }}>
            This will merge their content together.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setConfirmCombine(null)}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                border: "1px solid rgba(0,0,0,0.1)",
                borderRadius: 8,
                background: "white",
                color: "#7a7369",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmCombine}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: 600,
                border: "none",
                borderRadius: 8,
                background: "#191816",
                color: "white",
                cursor: "pointer",
              }}
            >
              Combine
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OutlineEditor(props: OutlineEditorProps) {
  return (
    <ReactFlowProvider>
      <OutlineEditorInner {...props} />
    </ReactFlowProvider>
  );
}
