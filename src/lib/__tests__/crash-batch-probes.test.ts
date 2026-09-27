/**
 * CRASH BATCH PROBES — 2026-09-27.
 *
 * Source-text probes (same style as mobile-probes): lock in the guards that
 * stop the project page crashing on an error payload (Sentry DSCRIBE-Y) and
 * the single browser Supabase client (Sentry DSCRIBE-10).
 */

import fs from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import { getActiveStep } from "@/lib/pipeline-step";

const SRC = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

const projectPage = () => read("app/(main)/project/[projectId]/page.tsx");
const supabaseLib = () => read("lib/supabase.ts");
const useAuth = () => read("hooks/useAuth.ts");

describe("project page: an error response is 'not found', never a project", () => {
  it("only stores the body when the response is OK and carries an id", () => {
    const src = projectPage();
    expect(src).toMatch(/r\.ok \? await r\.json\(\) : null/);
    expect(src).toMatch(/data && data\.id \? normalizeProject\(data\) : null/);
    expect(src).not.toMatch(/\.then\(\(data\) => \{\s*setProject\(data\);/);
  });

  it("defaults every related array before render", () => {
    const src = projectPage();
    for (const key of ["audio_uploads", "transcripts", "key_points", "chapters"]) {
      expect(src).toContain(`${key}: Array.isArray(data.${key}) ? data.${key} : []`);
    }
  });

  it("still shows the Project not found state for a null project", () => {
    expect(projectPage()).toContain('<EmptyState message="Project not found" />');
  });

  it("an error body really would have crashed getActiveStep (why the guard exists)", () => {
    const errorBody = { error: "Project not found" } as unknown as Parameters<typeof getActiveStep>[0];
    expect(() => getActiveStep(errorBody)).toThrow(/some/);
  });
});

describe("auth: one browser client, local session for the first read", () => {
  it("caches the browser client at module level, but not during SSR", () => {
    const src = supabaseLib();
    expect(src).toMatch(/let browserClient: SupabaseClient \| null = null;/);
    expect(src).toMatch(/typeof window === "undefined"/);
    expect(src).toMatch(/if \(!browserClient\)/);
  });

  it("useAuth reads getSession() first and keeps the auth listener", () => {
    const src = useAuth();
    expect(src).toContain("supabase.auth.getSession()");
    expect(src).not.toContain("supabase.auth.getUser()");
    expect(src).toContain("supabase.auth.onAuthStateChange(");
  });
});
