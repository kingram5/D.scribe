import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  BRAINSTORM_MESSAGES_MAX_BYTES,
  messagesPayloadBytes,
  pickBrainstormResume,
  type BrainstormMessage,
} from "@/lib/brainstorm-session";

const userA = {
  id: "user-a",
  email: "a@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
};

const userB = {
  id: "user-b",
  email: "b@example.com",
  email_confirmed_at: "2026-01-01T00:00:00Z",
};

const requireAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireAuth: () => requireAuth(),
}));

type Row = Record<string, unknown>;

const db = {
  projects: [] as Row[],
  sessions: [] as Row[],
};

function matches(row: Row, filters: Record<string, unknown>) {
  return Object.entries(filters).every(([key, value]) => row[key] === value);
}

function tableRows(table: string) {
  if (table === "projects") return db.projects;
  if (table === "brainstorm_sessions") return db.sessions;
  return [];
}

function makeChain(table: string) {
  const filters: Record<string, unknown> = {};
  let pendingInsert: Row | null = null;
  let pendingUpdate: Row | null = null;

  const runSelect = () => tableRows(table).find((row) => matches(row, filters)) ?? null;

  const execute = async () => {
    if (pendingInsert) {
      const row = {
        id: `sess-${db.sessions.length + 1}`,
        created_at: "2026-08-24T00:00:00.000Z",
        ...pendingInsert,
      };
      if (table === "brainstorm_sessions") db.sessions.push(row);
      return { data: row, error: null };
    }
    if (pendingUpdate) {
      const existing = runSelect();
      if (!existing) return { data: null, error: { message: "not found" } };
      Object.assign(existing, pendingUpdate);
      return { data: existing, error: null };
    }
    const data = runSelect();
    return data
      ? { data, error: null }
      : { data: null, error: { message: "not found" } };
  };

  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => {
      filters[column] = value;
      return chain;
    }),
    insert: vi.fn((row: Row) => {
      pendingInsert = row;
      return chain;
    }),
    update: vi.fn((row: Row) => {
      pendingUpdate = row;
      return chain;
    }),
    maybeSingle: vi.fn(async () => ({ data: runSelect(), error: null })),
    single: vi.fn(() => execute()),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      execute().then(onFulfilled, onRejected),
  };

  return chain;
}

const from = vi.fn((table: string) => makeChain(table));

vi.mock("@/lib/supabase", () => ({
  createServerClient: vi.fn(() => ({ from })),
}));

import { GET, PATCH, PUT } from "@/app/api/brainstorm/session/route";

function jsonRequest(method: string, url: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function seedOwnedProject(userId: string, projectId = "proj-a") {
  db.projects.push({ id: projectId, user_id: userId });
}

function turns(n: number): BrainstormMessage[] {
  const messages: BrainstormMessage[] = [];
  for (let i = 0; i < n; i++) {
    messages.push({ role: "user", content: `answer ${i + 1}` });
    messages.push({ role: "assistant", content: `question ${i + 1}` });
  }
  return messages;
}

describe("pickBrainstormResume", () => {
  it("picks the server copy when it has more messages", () => {
    const server = { messages: turns(3) };
    const local = { messages: turns(1), draft: "unsent" };
    const winner = pickBrainstormResume(server, local);
    expect(winner?.messages).toHaveLength(6);
    expect(winner?.messages[0].content).toBe("answer 1");
    expect(winner?.draft).toBe("");
  });

  it("picks the local copy when it has more messages", () => {
    const server = { messages: turns(1) };
    const local = { messages: turns(3), draft: "still typing" };
    const winner = pickBrainstormResume(server, local);
    expect(winner?.messages).toHaveLength(6);
    expect(winner?.draft).toBe("still typing");
  });

  it("tiebreaks equal-length copies in favor of the server, keeping the local draft", () => {
    const server = { messages: turns(2) };
    const local = { messages: turns(2), draft: "mid-answer" };
    const winner = pickBrainstormResume(server, local);
    expect(winner?.messages).toBe(server.messages);
    expect(winner?.draft).toBe("mid-answer");
  });

  it("returns the non-empty side when the other is missing or empty", () => {
    const onlyServer = pickBrainstormResume({ messages: turns(1) }, null);
    expect(onlyServer?.messages).toHaveLength(2);

    const onlyLocal = pickBrainstormResume(null, { messages: turns(1), draft: "x" });
    expect(onlyLocal?.messages).toHaveLength(2);
    expect(onlyLocal?.draft).toBe("x");

    const bothEmpty = pickBrainstormResume({ messages: [] }, { messages: [], draft: "" });
    expect(bothEmpty).toBeNull();

    const draftOnly = pickBrainstormResume(null, { messages: [], draft: "just a start" });
    expect(draftOnly).toEqual({ messages: [], draft: "just a start" });
  });
});

describe("brainstorm session route", () => {
  beforeEach(() => {
    db.projects.length = 0;
    db.sessions.length = 0;
    from.mockClear();
    requireAuth.mockReset();
    requireAuth.mockResolvedValue({ user: userA, error: null });
  });

  it("refuses user B read and write of user A's project session", async () => {
    seedOwnedProject("user-a", "proj-a");
    db.sessions.push({
      id: "sess-a",
      project_id: "proj-a",
      user_id: "user-a",
      messages: turns(1),
      status: "active",
      turn_count: 1,
      created_at: "2026-08-24T00:00:00.000Z",
      updated_at: "2026-08-24T00:00:00.000Z",
    });

    requireAuth.mockResolvedValue({ user: userB, error: null });

    const getRes = await GET(
      jsonRequest("GET", "http://localhost/api/brainstorm/session?project_id=proj-a"),
    );
    expect(getRes.status).toBe(200);
    await expect(getRes.json()).resolves.toEqual({ session: null });

    const putRes = await PUT(
      jsonRequest("PUT", "http://localhost/api/brainstorm/session", {
        project_id: "proj-a",
        messages: turns(2),
        turn_count: 2,
      }),
    );
    expect(putRes.status).toBe(404);

    const patchRes = await PATCH(
      jsonRequest("PATCH", "http://localhost/api/brainstorm/session", {
        project_id: "proj-a",
        status: "discarded",
      }),
    );
    expect(patchRes.status).toBe(200);
    await expect(patchRes.json()).resolves.toMatchObject({ ok: true, closed: false });
    expect(db.sessions[0].status).toBe("active");
    expect(db.sessions[0].user_id).toBe("user-a");
  });

  it("creates an active session on first PUT and updates it on the next", async () => {
    seedOwnedProject("user-a", "proj-a");
    const first = turns(1);
    const created = await PUT(
      jsonRequest("PUT", "http://localhost/api/brainstorm/session", {
        project_id: "proj-a",
        messages: first,
        turn_count: 1,
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.session.turn_count).toBe(1);
    expect(createdBody.session.messages).toEqual(first);
    expect(db.sessions).toHaveLength(1);

    const second = turns(3);
    const updated = await PUT(
      jsonRequest("PUT", "http://localhost/api/brainstorm/session", {
        project_id: "proj-a",
        messages: second,
        turn_count: 3,
      }),
    );
    expect(updated.status).toBe(200);
    const updatedBody = await updated.json();
    expect(updatedBody.session.turn_count).toBe(3);
    expect(updatedBody.session.messages).toEqual(second);
    expect(db.sessions).toHaveLength(1);
    expect(db.sessions[0].updated_at).toBeTruthy();
  });

  it("treats PATCH close as idempotent when the session is already gone", async () => {
    seedOwnedProject("user-a", "proj-a");

    const missing = await PATCH(
      jsonRequest("PATCH", "http://localhost/api/brainstorm/session", {
        project_id: "proj-a",
        status: "finished",
      }),
    );
    expect(missing.status).toBe(200);
    await expect(missing.json()).resolves.toEqual({ ok: true, closed: false });

    db.sessions.push({
      id: "sess-a",
      project_id: "proj-a",
      user_id: "user-a",
      messages: turns(2),
      status: "active",
      turn_count: 2,
      created_at: "2026-08-24T00:00:00.000Z",
      updated_at: "2026-08-24T00:00:00.000Z",
    });

    const firstClose = await PATCH(
      jsonRequest("PATCH", "http://localhost/api/brainstorm/session", {
        project_id: "proj-a",
        status: "finished",
      }),
    );
    expect(firstClose.status).toBe(200);
    await expect(firstClose.json()).resolves.toEqual({ ok: true, closed: true });
    expect(db.sessions[0].status).toBe("finished");

    const secondClose = await PATCH(
      jsonRequest("PATCH", "http://localhost/api/brainstorm/session", {
        project_id: "proj-a",
        status: "discarded",
      }),
    );
    expect(secondClose.status).toBe(200);
    await expect(secondClose.json()).resolves.toEqual({ ok: true, closed: false });
    expect(db.sessions[0].status).toBe("finished");
  });

  it("rejects an oversized messages payload with 413", async () => {
    seedOwnedProject("user-a", "proj-a");
    const oversized: BrainstormMessage[] = [{
      role: "user",
      content: "x".repeat(BRAINSTORM_MESSAGES_MAX_BYTES + 50),
    }];
    expect(messagesPayloadBytes(oversized)).toBeGreaterThan(BRAINSTORM_MESSAGES_MAX_BYTES);

    const res = await PUT(
      jsonRequest("PUT", "http://localhost/api/brainstorm/session", {
        project_id: "proj-a",
        messages: oversized,
        turn_count: 1,
      }),
    );
    expect(res.status).toBe(413);
    expect(db.sessions).toHaveLength(0);
  });
});
