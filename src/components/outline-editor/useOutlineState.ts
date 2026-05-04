"use client";

import { useReducer, useCallback, useRef, useEffect, useState } from "react";
import { Chapter, KeyPoint } from "@/types";

export interface EditorState {
  chapters: Chapter[];
  keyPoints: KeyPoint[];
  dirty: boolean;
}

export type EditorAction =
  | { type: "INIT"; chapters: Chapter[]; keyPoints: KeyPoint[] }
  | { type: "MOVE_KEY_POINT"; keyPointId: string; fromChapterId: string; toChapterId: string; toIndex?: number }
  | { type: "REORDER_KEY_POINT"; chapterId: string; keyPointId: string; newIndex: number }
  | { type: "COMBINE_KEY_POINTS"; targetId: string; sourceId: string }
  | { type: "COMBINE_CHAPTERS"; targetId: string; sourceId: string }
  | { type: "EDIT_CHAPTER"; chapterId: string; field: "title" | "summary"; value: string }
  | { type: "EDIT_KEY_POINT"; keyPointId: string; field: "title" | "summary"; value: string }
  | { type: "DELETE_CHAPTER"; chapterId: string }
  | { type: "DELETE_KEY_POINT"; keyPointId: string }
  | { type: "ADD_CHAPTER"; afterChapterId?: string }
  | { type: "ADD_KEY_POINT"; chapterId: string }
  | { type: "REORDER_CHAPTERS"; orderedIds: string[] }
  | { type: "MARK_CLEAN" };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "INIT":
      return { chapters: action.chapters, keyPoints: action.keyPoints, dirty: false };

    case "MOVE_KEY_POINT": {
      const chapters = state.chapters.map((ch) => {
        if (ch.id === action.fromChapterId) {
          return { ...ch, key_point_ids: ch.key_point_ids.filter((id) => id !== action.keyPointId) };
        }
        if (ch.id === action.toChapterId) {
          const ids = [...ch.key_point_ids];
          const idx = action.toIndex ?? ids.length;
          ids.splice(idx, 0, action.keyPointId);
          return { ...ch, key_point_ids: ids };
        }
        return ch;
      });
      return { ...state, chapters, dirty: true };
    }

    case "REORDER_KEY_POINT": {
      const chapters = state.chapters.map((ch) => {
        if (ch.id !== action.chapterId) return ch;
        const ids = ch.key_point_ids.filter((id) => id !== action.keyPointId);
        ids.splice(action.newIndex, 0, action.keyPointId);
        return { ...ch, key_point_ids: ids };
      });
      return { ...state, chapters, dirty: true };
    }

    case "COMBINE_KEY_POINTS": {
      const target = state.keyPoints.find((kp) => kp.id === action.targetId);
      const source = state.keyPoints.find((kp) => kp.id === action.sourceId);
      if (!target || !source) return state;

      const merged: KeyPoint = {
        ...target,
        title: `${target.title} & ${source.title}`,
        summary: `${target.summary} ${source.summary}`,
        tags: [...new Set([...(target.tags || []), ...(source.tags || [])])],
        supporting_quotes: [...(target.supporting_quotes || []), ...(source.supporting_quotes || [])],
        relevance_score: Math.max(target.relevance_score, source.relevance_score),
      };

      const keyPoints = state.keyPoints
        .map((kp) => (kp.id === action.targetId ? merged : kp))
        .filter((kp) => kp.id !== action.sourceId);

      const chapters = state.chapters.map((ch) => ({
        ...ch,
        key_point_ids: ch.key_point_ids.filter((id) => id !== action.sourceId),
      }));

      return { ...state, chapters, keyPoints, dirty: true };
    }

    case "COMBINE_CHAPTERS": {
      const target = state.chapters.find((ch) => ch.id === action.targetId);
      const source = state.chapters.find((ch) => ch.id === action.sourceId);
      if (!target || !source) return state;

      const merged: Chapter = {
        ...target,
        title: `${target.title} & ${source.title}`,
        summary: `${target.summary} ${source.summary}`,
        key_point_ids: [...target.key_point_ids, ...source.key_point_ids],
        target_word_count: target.target_word_count + source.target_word_count,
      };

      const chapters = state.chapters
        .map((ch) => (ch.id === action.targetId ? merged : ch))
        .filter((ch) => ch.id !== action.sourceId)
        .map((ch, i) => ({ ...ch, chapter_number: i + 1, sort_order: i }));

      return { ...state, chapters, dirty: true };
    }

    case "EDIT_CHAPTER": {
      const chapters = state.chapters.map((ch) =>
        ch.id === action.chapterId ? { ...ch, [action.field]: action.value } : ch
      );
      return { ...state, chapters, dirty: true };
    }

    case "EDIT_KEY_POINT": {
      const keyPoints = state.keyPoints.map((kp) =>
        kp.id === action.keyPointId ? { ...kp, [action.field]: action.value } : kp
      );
      return { ...state, keyPoints, dirty: true };
    }

    case "DELETE_CHAPTER": {
      const chapters = state.chapters
        .filter((ch) => ch.id !== action.chapterId)
        .map((ch, i) => ({ ...ch, chapter_number: i + 1, sort_order: i }));
      return { ...state, chapters, dirty: true };
    }

    case "DELETE_KEY_POINT": {
      const keyPoints = state.keyPoints.filter((kp) => kp.id !== action.keyPointId);
      const chapters = state.chapters.map((ch) => ({
        ...ch,
        key_point_ids: ch.key_point_ids.filter((id) => id !== action.keyPointId),
        blended_key_point_ids: (ch.blended_key_point_ids || []).filter((id) => id !== action.keyPointId),
      }));
      return { ...state, chapters, keyPoints, dirty: true };
    }

    case "ADD_CHAPTER": {
      const insertIdx = action.afterChapterId
        ? state.chapters.findIndex((ch) => ch.id === action.afterChapterId) + 1
        : state.chapters.length;
      const newChapter: Chapter = {
        id: crypto.randomUUID(),
        project_id: state.chapters[0]?.project_id || "",
        chapter_number: insertIdx + 1,
        title: "New Chapter",
        summary: "",
        key_point_ids: [],
        target_word_count: 3000,
        status: "outlined",
        sort_order: insertIdx,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const chapters = [...state.chapters];
      chapters.splice(insertIdx, 0, newChapter);
      return {
        ...state,
        chapters: chapters.map((ch, i) => ({ ...ch, chapter_number: i + 1, sort_order: i })),
        dirty: true,
      };
    }

    case "ADD_KEY_POINT": {
      const newKp: KeyPoint = {
        id: crypto.randomUUID(),
        project_id: state.chapters[0]?.project_id || "",
        transcript_id: "",
        title: "New Key Point",
        summary: "",
        supporting_quotes: [],
        tags: [],
        relevance_score: 0.5,
        covered_in_chapter: null,
        created_at: new Date().toISOString(),
      };
      const chapters = state.chapters.map((ch) =>
        ch.id === action.chapterId
          ? { ...ch, key_point_ids: [...ch.key_point_ids, newKp.id] }
          : ch
      );
      return { ...state, keyPoints: [...state.keyPoints, newKp], chapters, dirty: true };
    }

    case "REORDER_CHAPTERS": {
      const { orderedIds } = action;
      const chapters = state.chapters.map((ch) => {
        const newNum = orderedIds.indexOf(ch.id) + 1;
        return { ...ch, chapter_number: newNum, sort_order: newNum - 1 };
      });
      return { ...state, chapters, dirty: true };
    }

    case "MARK_CLEAN":
      return { ...state, dirty: false };

    default:
      return state;
  }
}

const MAX_HISTORY = 50;

export function useOutlineState() {
  const [state, rawDispatch] = useReducer(editorReducer, {
    chapters: [],
    keyPoints: [],
    dirty: false,
  });

  const pastRef = useRef<EditorState[]>([]);
  const futureRef = useRef<EditorState[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const dispatch = useCallback((action: EditorAction) => {
    if (action.type === "INIT" || action.type === "MARK_CLEAN") {
      rawDispatch(action);
      if (action.type === "INIT") {
        pastRef.current = [];
        futureRef.current = [];
      }
      syncHistoryFlags();
      return;
    }

    // Push current state to history before applying action
    pastRef.current = [...pastRef.current.slice(-(MAX_HISTORY - 1)), { ...state }];
    futureRef.current = [];
    rawDispatch(action);
    syncHistoryFlags();
  }, [state, syncHistoryFlags]);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    const previous = pastRef.current[pastRef.current.length - 1];
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, { ...state }];
    rawDispatch({ type: "INIT", chapters: previous.chapters, keyPoints: previous.keyPoints });
    syncHistoryFlags();
  }, [state, syncHistoryFlags]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    const next = futureRef.current[futureRef.current.length - 1];
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, { ...state }];
    rawDispatch({ type: "INIT", chapters: next.chapters, keyPoints: next.keyPoints });
    syncHistoryFlags();
  }, [state, syncHistoryFlags]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && ((e.key === "z" && e.shiftKey) || e.key === "y")) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  return {
    state,
    dispatch,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
