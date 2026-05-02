# Register the D.scribe Log Watcher Cron

Use the Claude Code CronCreate tool to register the following cron job.

## Parameters

| Field | Value |
|---|---|
| `schedule` | `*/15 * * * *` |
| `recurring` | `true` |
| `prompt` | See below |

## Prompt

```
Run the D.scribe log watcher. Follow all steps in C:\manuscript\scripts\log-watcher.md exactly.
```

## What this does

Every 15 minutes, a Claude Code agent will:
1. Read `C:\manuscript\logs\app.log` for new entries since the last checkpoint
2. Parse, classify, and group all errors and warnings
3. Check for repeated errors (3+ in 30 min) and send immediate escalation to Kyle via Telegram if found
4. Attempt auto-fix for simple null/type errors (with TypeScript validation)
5. Send a digest to Kyle via Telegram if any issues exist
6. Update the checkpoint file

## Files involved

- Log source: `C:\manuscript\logs\app.log`
- Checkpoint: `C:\manuscript\logs\.watcher-checkpoint`
- Error counts: `C:\manuscript\logs\.error-counts.json`
- Procedure: `C:\manuscript\scripts\log-watcher.md`
- Telegram route_key: `8380825972`

## Notes

- The cron will NOT send a message when logs are clean — only on errors or warnings.
- The escalation message fires immediately (before the digest) when the same error hits 3+ times in 30 minutes.
- Escalation will not re-fire for the same error fingerprint until the count resets (2 hours of silence).
