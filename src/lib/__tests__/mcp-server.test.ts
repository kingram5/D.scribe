import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpServer } from "@/lib/chatgpt-app/server";
import { WIDGET_URI, type ToolDeps } from "@/lib/chatgpt-app/tools";
import type { PlanStore } from "@/lib/book-plan/persist";

/**
 * Real MCP protocol round-trip (SDK client <-> our server) over an in-memory
 * transport: tool listing, schemas, annotations, the widget resource, and a
 * tool call. The storage layer is faked; it is covered by sql-032.test.ts.
 */

function memoryStore() {
  const previews = new Map<string, unknown>();
  return {
    async createPreview(a: { plan: unknown }) {
      const id = crypto.randomUUID();
      previews.set(id, a);
      return { id, claimToken: "t".repeat(32), expiresAt: "2026-10-05T00:00:00.000Z" };
    },
  } as unknown as PlanStore;
}

async function connect(deps: ToolDeps) {
  const server = buildMcpServer(deps);
  const client = new Client({ name: "test", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

const env = { ...process.env };
beforeEach(() => {
  process.env.CHATGPT_APP_ANON_PREVIEW = "true";
});
afterEach(() => {
  process.env = { ...env };
});

describe("MCP surface", () => {
  const deps: ToolDeps = {
    identity: null,
    store: memoryStore(),
    db: {} as never,
    ink: { reserve: async () => ({ allowed: false }), settle: async () => {}, release: async () => {} },
    rateLimit: async () => true,
    anonSubject: null,
  };

  it("lists the six tools with explicit annotations and auth schemes", async () => {
    const client = await connect(deps);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["add_to_project", "get_plan_status", "get_project_summary", "list_projects", "preview_book_plan", "save_book_plan"]);
    for (const t of tools) {
      expect(typeof t.annotations?.readOnlyHint).toBe("boolean");
      expect(typeof t.annotations?.destructiveHint).toBe("boolean");
      expect(typeof t.annotations?.openWorldHint).toBe("boolean");
      expect(t.annotations?.destructiveHint).toBe(false);
      expect(Array.isArray((t._meta as Record<string, unknown>)?.securitySchemes)).toBe(true);
    }
    // OpenAI reads securitySchemes top-level; _meta is only the back-compat mirror.
    // Read the raw wire result: the SDK client's typed listTools() strips unknown fields.
    const raw = await client.request({ method: "tools/list" }, z.object({ tools: z.array(z.looseObject({ name: z.string() })) }));
    const top = raw.tools.map((t) => (t as { securitySchemes?: unknown }).securitySchemes);
    expect(top.every((s) => Array.isArray(s))).toBe(true);
    const rawSave = raw.tools.find((t) => t.name === "save_book_plan") as unknown as { securitySchemes: Array<{ type: string }> };
    expect(rawSave.securitySchemes.map((s) => s.type)).toEqual(["oauth2"]);
    const save = tools.find((t) => t.name === "save_book_plan")!;
    expect(save.annotations?.readOnlyHint).toBe(false);
    expect(JSON.stringify(save.inputSchema)).not.toMatch(/user_id/); // identity never comes from args
    const rawAdd = raw.tools.find((t) => t.name === "add_to_project") as unknown as { securitySchemes: Array<{ type: string }> };
    expect(rawAdd.securitySchemes.map((s) => s.type)).toEqual(["oauth2"]);
    const add = tools.find((t) => t.name === "add_to_project")!;
    expect(add.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: false, idempotentHint: true });
    expect(Object.keys((add.inputSchema as { properties: object }).properties).sort()).toEqual(["kind", "project_id", "source_app", "text", "title"]);
    expect((add.inputSchema as unknown as { properties: { text: { maxLength: number } } }).properties.text.maxLength).toBe(120_000);
    const preview = tools.find((t) => t.name === "preview_book_plan")!;
    expect((preview._meta as Record<string, unknown>)["openai/outputTemplate"]).toBe(WIDGET_URI);
  });

  it("serves the widget as an MCP Apps resource with an empty CSP", async () => {
    const client = await connect(deps);
    const res = await client.readResource({ uri: WIDGET_URI });
    const c = res.contents[0] as unknown as { mimeType: string; text: string; _meta: { ui: { csp: { connectDomains: string[] } } } };
    expect(c.mimeType).toBe("text/html;profile=mcp-app");
    expect(c.text).toContain("Save to D.scribe");
    expect(c._meta.ui.csp.connectDomains).toEqual([]);
    expect(c.text).not.toMatch(/https?:\/\/(?!www\.w3)/); // no external fetches baked into the card
  });

  it("round-trips a faithful import over the protocol", async () => {
    const client = await connect(deps);
    const res = await client.callTool({
      name: "preview_book_plan",
      arguments: { mode: "import", import_text: "Chapter 1: Start Here\nmy words\n\nChapter 2: Keep Going" },
    });
    expect(res.isError).toBeFalsy();
    const sc = res.structuredContent as { plan: { chapters: Array<{ title: string; provenance: string }> } };
    expect(sc.plan.chapters.map((c) => c.title)).toEqual(["Start Here", "Keep Going"]);
    expect(sc.plan.chapters.every((c) => c.provenance === "imported")).toBe(true);
    expect((res.content as Array<{ text: string }>)[0].text).toMatch(/nothing has been saved/i);
  });

  it("add_to_project over the protocol: an unlinked caller gets the linking challenge, not a save", async () => {
    process.env.CHATGPT_APP_MCP = "true";
    process.env.CHATGPT_APP_WRITES = "true";
    const client = await connect(deps);
    const res = await client.callTool({
      name: "add_to_project",
      arguments: { project_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "t", text: "some memories", source_app: "chatgpt", kind: "memory" },
    });
    expect(res.isError).toBe(true);
    expect((res.structuredContent as { error: { code: string } }).error.code).toBe("auth_required");
    expect((res._meta as Record<string, unknown>)["mcp/www_authenticate"]).toBeTruthy();
    expect((res.content as Array<{ type: string; text: string }>)[0].type).toBe("text");
  });

  it("protocol-level validation rejects bad arguments", async () => {
    const client = await connect(deps);
    const res = await client.callTool({ name: "save_book_plan", arguments: { preview_id: "not-a-uuid", claim_token: "x" } });
    expect(res.isError).toBe(true);
  });
});
