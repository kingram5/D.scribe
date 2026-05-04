# D.scribe Log Watcher — Agent Procedure

You are a log monitoring agent for D.scribe, a Next.js 15 app at `C:\manuscript`. Follow every step in order. Do not skip steps. Do not send a Telegram message if there are zero errors and zero warnings.

---

## Step 1 — Read the log file with checkpoint

1. Check whether `C:\manuscript\logs\.watcher-checkpoint` exists.
   - If it exists, read its contents. It contains a single ISO timestamp string (e.g. `2026-04-30T14:00:00.000Z`). This is the `checkpoint_time`.
   - If it does not exist, set `checkpoint_time` = null (read mode = "last 100 lines").

2. Read `C:\manuscript\logs\app.log`.
   - If `checkpoint_time` is set: parse each line as JSON, keep only lines where `timestamp > checkpoint_time`.
   - If `checkpoint_time` is null: take the last 100 lines of the file.
   - If the file does not exist or is empty: skip to Step 7 (write checkpoint, do not send).

---

## Step 2 — Parse and group log lines

Parse each selected line as JSON. Each line has the shape:
```json
{ "timestamp": "...", "level": "error|warn|info", "route": "...", "userId": "...", "message": "...", "error": "...", "stack": "...", "meta": {} }
```

Keep only lines where `level` is `"error"` or `"warn"`. Discard `"info"` lines.

Group by a **fingerprint**: `(route ?? "no-route") + ":" + message.slice(0, 80)`.

For each unique fingerprint, track:
- `level` (error or warn)
- `route`
- `message`
- `count` (how many times it appeared in this window)
- `firstLine` (the full parsed object of the first occurrence — for stack trace)
- `lastSeen` timestamp

---

## Step 3 — Classify each unique error

Assign a `classification` to each fingerprint based on these rules (first match wins):

| Classification | Match condition |
|---|---|
| `claude_api_fail` | message contains "Claude API" AND (message contains "4" or "5" followed by digits — i.e., 4xx/5xx status) |
| `claude_api_fail` | route is `/api/brainstorm`, `/api/generate`, `/api/outline`, `/api/analyze`, `/api/enrich`, `/api/rewrite/chapter`, `/api/rewrite/selection` AND message contains "API" or "fetch" |
| `db_error` | message contains "Supabase" OR message contains "DB error" OR message contains "insert error" OR error field contains "PGRST" or "PostgreSQL" |
| `auth_error` | message contains "Unauthorized" OR message contains "401" OR message contains "403" OR route contains "auth" |
| `unhandled_crash` | route contains "error-boundary" OR message contains "uncaught" OR message contains "unhandled" |
| `type_error` | error field contains "TypeError" OR message contains "TypeError" OR message contains "is not a function" OR message contains "Cannot read" |
| `null_ref` | message contains "null" OR message contains "undefined" OR message contains "Cannot read properties of null" OR message contains "Cannot read properties of undefined" |
| `other` | anything else |

---

## Step 4 — Escalation check (Layer 3)

Read `C:\manuscript\logs\.error-counts.json`. If it does not exist, treat its contents as `{}`.

The format is:
```json
{
  "fingerprint_string": {
    "count": 5,
    "firstSeen": "2026-04-30T14:00:00.000Z",
    "lastSeen": "2026-04-30T14:12:00.000Z",
    "alerted": false
  }
}
```

**Update counts from the current window:**
For each fingerprint seen in this run:
- If it exists in `.error-counts.json`: increment `count` by the number of occurrences in this window, update `lastSeen`.
- If it does not exist: create it with `count` = occurrences in this window, `firstSeen` = first occurrence timestamp, `lastSeen` = last occurrence timestamp, `alerted` = false.

**Reset stale fingerprints:**
For every fingerprint in `.error-counts.json` where `lastSeen` is more than 2 hours before now: set `count` = 0, `alerted` = false. (Do not delete the entry — just reset it.)

**Check for escalation:**
For each fingerprint where ALL of the following are true:
- `count >= 3`
- `alerted` is false
- `lastSeen` is within the last 30 minutes (i.e., `now - lastSeen < 30 min`)
- `level` is `"error"` (not warn)

Send an IMMEDIATE escalation message (before the normal digest) via `mcp__answer-channel__reply`:
- `route_key`: 8380825972
- `channel_type`: telegram
- Message format:
```
🚨 Repeated error in D.scribe (Nx in 30min)
Route: [route]
Error: [message]
[stack trace — first 3 lines only, or "no stack" if absent]
```

After sending, set `alerted` = true for that fingerprint in the JSON.

**Save the updated `.error-counts.json`** back to `C:\manuscript\logs\.error-counts.json`.

---

## Step 5 — Auto-fix attempt (null_ref and type_error only)

For each fingerprint classified as `null_ref` or `type_error`:

1. Check whether `firstLine.stack` exists. If not, skip.
2. Parse the stack trace to find the first line that references a file inside `C:\manuscript\src` (not `node_modules`). Extract the file path and line number.
3. Read that file.
4. Examine the specific line (±5 lines for context). Determine if the fix is a simple, mechanical change:
   - A missing optional chain (`?.`)
   - A missing nullish coalescing default (`?? ""`, `?? []`, `?? 0`)
   - A missing null guard (`if (!x) return`)
   - Nothing else — if the fix requires logic changes, business logic understanding, or more than 3 lines changed, skip it.
5. If the fix is mechanical:
   - Apply the fix using the Edit tool.
   - Run: `cd C:\manuscript && npx tsc --noEmit`
   - If TypeScript passes: mark the fix result as `"auto-fixed: [brief description]"`
   - If TypeScript fails: revert the file to its original content, mark as `"ts-check-failed — needs review"`
6. If no mechanical fix is apparent: mark as `"needs review"`

---

## Step 6 — Build the digest

Construct the digest message. Only include errors and warnings — skip info.

Format:
```
🔍 D.scribe Log Report — [start of window] → [now]

❌ ERRORS (N)
• [route] [classification]: [message truncated to 100 chars] (Nx in window)
  → [auto-fix result OR "Needs review"]

⚠️ WARNINGS (N)
• [route] [classification]: [message truncated to 100 chars] (Nx in window)

✅ No issues found
```

Rules:
- If there are zero errors AND zero warnings: do NOT send. Skip to Step 7.
- Show errors first, then warnings.
- If a section has zero items, omit that section entirely (don't show "ERRORS (0)").
- Sort errors by count descending (highest first).
- Truncate message to 100 characters max. Append "..." if truncated.
- If auto-fix was applied, show `→ Auto-fixed: [description]`.
- If auto-fix failed TypeScript: show `→ Reverted (TS check failed) — needs review`.
- If no fix attempted: show `→ Needs review` for `null_ref`/`type_error`; omit the arrow line for other classifications.

---

## Step 7 — Send digest (if there are issues)

If there are any errors or warnings in the digest:

Send via `mcp__answer-channel__reply`:
- `route_key`: 8380825972
- `channel_type`: telegram
- `message`: the full digest text constructed in Step 6

If clean (zero errors, zero warnings): do not send anything.

---

## Step 8 — Update the checkpoint

Write `new Date().toISOString()` to `C:\manuscript\logs\.watcher-checkpoint` (overwrite). This marks the time through which all log lines have been processed.
