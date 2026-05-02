# D.scribe Logging Setup

Three-layer logging stack: **pino** (async transport) + **Sentry** (exception tracking) + **Axiom** (log aggregation).  
All three degrade gracefully — the app works without any of them configured.

---

## Env vars to fill in (`.env.local`)

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | app.sentry.io → your project → Settings → Client Keys (DSN) |
| `SENTRY_ORG` | app.sentry.io → Settings → General → Organization slug |
| `SENTRY_PROJECT` | app.sentry.io → your project → Settings → General → Project slug |
| `SENTRY_AUTH_TOKEN` | app.sentry.io → Settings → Auth Tokens → Create token (scope: `project:releases`) — only needed for source map uploads at build time |
| `AXIOM_TOKEN` | app.axiom.co → Settings → API Tokens → New token (Ingest permission is sufficient) |
| `AXIOM_DATASET` | Set to `dscribe-logs` by default; create this dataset in Axiom first |

---

## Sentry

### Get DSN
1. Go to [app.sentry.io](https://app.sentry.io)
2. Create project → framework: **Next.js**
3. Copy the DSN from the setup screen (looks like `https://abc123@o123.ingest.sentry.io/456`)
4. Paste into `NEXT_PUBLIC_SENTRY_DSN`

### Verify it works
- Trigger an unhandled error in the app (or throw from any API route)
- Check Sentry → Issues — the error should appear within seconds
- Error boundaries (`src/app/error.tsx`, `src/app/(main)/error.tsx`) call `Sentry.captureException` directly on the client
- The `/api/log-client-error` endpoint captures the same error server-side

### Source maps (optional, production only)
Fill in `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`. The `withSentryConfig` wrapper in `next.config.ts` uploads source maps automatically at `next build`. `hideSourceMaps: true` strips them from the public bundle.

---

## Axiom

### Get token + dataset
1. Go to [app.axiom.co](https://app.axiom.co)
2. Create a dataset named `dscribe-logs` (Datasets → New Dataset)
3. Go to Settings → API Tokens → New API Token → grant **Ingest** permission on the `dscribe-logs` dataset
4. Copy token into `AXIOM_TOKEN`

### Verify it works
- Start the app in production mode (`bun run build && bun run start`)
- Make a few API calls (brainstorm, outline, etc.)
- Open Axiom → Datasets → `dscribe-logs` → Explorer
- You should see structured JSON log events within a few seconds

---

## Local file fallback

`logs/app.log` is always written regardless of Sentry/Axiom configuration. This file is:
- Excluded from git (`.gitignore` has `/logs/`)
- Rotated manually (no auto-rotation — tail it with `Get-Content -Wait logs/app.log` in dev)
- Still used by any cron-based log watcher scripts

In **development** (`NODE_ENV !== 'production'`), pino-pretty renders human-readable colorized output to the console. No Axiom connection is made in dev.

---

## Startup warnings

If `AXIOM_TOKEN` is not set in production, you will see:

```
[logger] AXIOM_TOKEN not set — skipping Axiom transport, writing to file only
```

This is intentional. File logging still works. Set the token when ready to enable Axiom.

If `NEXT_PUBLIC_SENTRY_DSN` is empty, Sentry is initialized with `enabled: false` — zero overhead, no errors thrown.
