# Theo Live staging worker on the Windows box (C:\Answer)

For the staging Theo Live test only. Production needs an always-on host (see `openai-stack-rollout.md`); this PC sleeps, reboots for Windows Update and restarts its agents at 2am, and nothing restarts the worker on its own. Run it only for the length of a test session.

## What it is

`worker/theo-live.ts` is a long-running Node 24 process. Every 2 seconds it writes a heartbeat row, claims queued voice sessions, opens the vendor session, and keeps a control WebSocket ("sideband") to OpenAI open for each session. It does nothing paid until a signed-in cohort user presses **Talk with Theo Live** on the preview.

## Ports and tunnels: none

All of the worker's connections are outbound:

- HTTPS to the staging Supabase host, for the heartbeat, session rows and transcript events.
- HTTPS/WSS to `api.openai.com`, to create the session and hold the sideband.

The preview never calls the worker. The web route queues a `theo_live_sessions` row, the worker claims it from the database, and the SDP offer and answer travel through that row. The browser's audio goes over WebRTC straight to OpenAI. No inbound port, firewall rule or Cloudflare tunnel is needed.

## Prerequisites

- Node 24.x (this box: v24.14.1; the worker uses `--use-env-proxy`).
- The PR branch checked out with dependencies installed: `bun install --frozen-lockfile` (or `npm ci`) in `C:\Answer\projects\dscribe-pr47`.
- The staging setup done first (`openai-staging-handoff.md` plus the seed in `deploy/staging-seed-ink.sql`): staging project up, test user signed in, seed pasted, and the preview rebuilt with the Live settings.

## Environment variables (names only)

They go in one file outside the repo and outside any synced folder: `%USERPROFILE%\.dscribe\theo-live-staging.env`, one `NAME=value` per line, readable by Kyle's account only. Kyle enters the two secrets himself. **Never copy `C:\Answer\projects\dscribe-manuscript\.env.local`: it points at the production database.**

| Name | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Staging project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Staging public key (preflight requires it) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Staging service key, the same one entered in Vercel for this branch |
| `DSCRIBE_STAGING_SUPABASE_REF` | Staging project ref; preflight refuses any URL that doesn't match it |
| `NEXT_PUBLIC_SITE_URL` | The preview's stable branch URL (https) |
| `DSCRIBE_OPENAI_API_KEY` (or `OPENAI_API_KEY`) | **Secret.** OpenAI key with a spend limit set on the OpenAI side |
| `OPENAI_PR_USER_IDS` | Test user UUID(s); identical to the preview |
| `PUBLISHER_READY_TEXT_PROVIDER` | Preflight requires the OpenAI value. The worker itself follows each run's pinned provider |
| `OPENAI_PR_RATE_CARD` | Identical to the preview |
| `THEO_VOICE_PROVIDER`, `THEO_LIVE_STAGING`, `THEO_LIVE_USD_PER_MINUTE` | Values per `openai-stack-rollout.md` § Theo Live service; identical to the preview |
| `OPENAI_THEO_LIVE_MODEL`, `THEO_LIVE_PRO_SECONDS`, `THEO_LIVE_PREMIUM_SECONDS` | Optional; identical to the preview if set there |
| `VERCEL_ENV` | `preview`. Live refuses to run when this reads production |

Leave out any Anthropic key: Live only runs on OpenAI-pinned runs, so the worker never calls Claude. There is no proxy on this box, so `HTTPS_PROXY` stays unset.

## Start (foreground window)

Open a new PowerShell window and paste:

```powershell
$Host.UI.RawUI.WindowTitle = "TheoLiveWorker-staging"
Set-Location C:\Answer\projects\dscribe-pr47
Get-Content "$env:USERPROFILE\.dscribe\theo-live-staging.env" | ForEach-Object {
  if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)$') { [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), 'Process') }
}
npm run staging:preflight
if ($LASTEXITCODE -ne 0) { Write-Host "Preflight failed: worker NOT started." } else { node --use-env-proxy --import tsx worker/theo-live.ts }
```

- Preflight runs first, as `ExecStartPre` does in the systemd template. It refuses a production target or a URL that doesn't match the pinned ref.
- Node runs directly rather than through `npm run theo:worker`, so Ctrl+C reaches the worker without npm's batch-job prompt.
- Expected output is one line, `Theo Live staging worker starting; ...`, then silence. Errors print a category only, never payloads or keys.

## Confirm the heartbeat

In a **second** PowerShell window, load the same file with the `Get-Content` loop above, then run:

```powershell
Set-Location C:\Answer\projects\dscribe-pr47
npm run staging:preflight -- --remote
```

- **Pass** prints `Read-only remote preflight passed; ...`. It checked that the five new tables are readable, that a worker heartbeat is under 15 seconds old, and that the OpenAI model list (free) includes the configured models.
- `No recent Live worker heartbeat` means the worker isn't running or can't reach Supabase.
- `<table>: read failed` means a wrong key or URL, or the staging project is paused.

The check only reads; it creates no rows, sessions or paid calls.

The Interview page asks whether Live is available **once, when it loads**. Start the worker first, then load or refresh the Interview page.

## Stop

1. End any voice session in the app first, and wait for the panel to show it closed.
2. In the worker window press **Ctrl+C** (Ctrl+Break also works). The worker asks OpenAI to close any open session and exits within 10 seconds.
3. Never use `Stop-Process`, `taskkill /F` or Task Manager while a session is open:
   - No close request goes out, so the vendor session keeps billing until its own expiry.
   - The account's allowance stays held. One unresolved session per account blocks a new one.
   - The next worker start reattaches stale sessions only to close them.
4. Closing the window counts as a stop signal too, but Windows force-kills about 10 seconds later, so Ctrl+C is the safe way.
5. If you must find the process, target it by this window's title. Never kill `node` broadly: other agents on this box run on Node.

## Stuck sessions

The service-role checks in `openai-stack-rollout.md` § Recovery and rollback cover this. Kyle runs the `theo_live_sessions where state <> 'closed'` query in the **staging** SQL editor. An unresolved session needs vendor-side closure evidence before its hold is released; never free it on elapsed time alone.

## Cost while it runs

- An idle worker makes no paid calls; it uses only Supabase API requests.
- A Live session bills OpenAI per minute at the configured Live rate.
- Each answer adds a small text call (interview follow-up and coverage on the run's pinned model).
- The run's First Draft and Editor review are paid text calls that must finish before Live can start.
