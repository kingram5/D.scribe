"use client";

import { useCallback, useRef, useState } from "react";
import type { ChapterContent } from "@/types";

/** Keep chapter drafts until the exact submitted text has been saved. */
export function useChapterEdits(onSaved: (chapterId: string, data: ChapterContent) => void) {
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const activeRef = useRef<string | null>(null);
  const contentRef = useRef("");
  const draftsRef = useRef(new Map<string, string>());
  const savingRef = useRef(false);

  const loadChapter = useCallback((chapterId: string, persisted: string) => {
    activeRef.current = chapterId;
    const text = draftsRef.current.get(chapterId) ?? persisted;
    contentRef.current = text;
    setContent(text);
    setSaved(!draftsRef.current.has(chapterId));
    setSaveError(null);
  }, []);

  const handleContentChange = useCallback((text: string) => {
    if (!activeRef.current) return;
    draftsRef.current.set(activeRef.current, text);
    contentRef.current = text;
    setContent(text);
    setSaved(false);
    setDirty(true);
  }, []);

  // Generated revisions must also preserve drafts in inactive chapters.
  const refreshChapter = useCallback((chapterId: string, persisted: string): boolean => {
    if (draftsRef.current.has(chapterId)) return false;
    if (activeRef.current === chapterId) loadChapter(chapterId, persisted);
    return true;
  }, [loadChapter]);

  const saveContent = useCallback(async (): Promise<boolean> => {
    const chapterId = activeRef.current;
    const submitted = contentRef.current;
    if (!chapterId || !submitted.trim() || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/chapter-content/${chapterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: submitted }),
      });
      if (!res.ok) throw new Error("Your changes could not be saved. Please try again.");
      const data = await res.json();
      if (typeof data.content !== "string") throw new Error("The save was not confirmed. Please try again.");
      onSaved(chapterId, data);
      // A pending save must not clear newer edits or mark another chapter saved.
      if (draftsRef.current.get(chapterId) === submitted) draftsRef.current.delete(chapterId);
      setDirty(draftsRef.current.size > 0);
      if (activeRef.current === chapterId) setSaved(!draftsRef.current.has(chapterId));
      if (data.needs_distill) void fetch("/api/voice-memory", { method: "POST" }).catch(() => {});
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Your changes could not be saved. Please try again.");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [onSaved]);

  return { content, saved, saving, saveError, dirty, loadChapter, handleContentChange, refreshChapter, saveContent };
}
