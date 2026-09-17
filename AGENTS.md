# AGENTS.md

## Cursor Cloud specific instructions

D.Scribe (package name `manuscript`) is a Next.js 15 (App Router, React 19) AI
voice-to-manuscript SaaS. It talks to Supabase (Auth + Postgres), Stripe,
Cloudflare R2, Anthropic, Deepgram, and a few other vendors. There is a single
dev service — the Next.js dev server. The top-level `worker/` directory is
dev-only and is not wired into the app.

### Package manager: Bun (not npm)

Both `bun.lock` and `package-lock.json` are committed, but CI and this
environment use **Bun**. The startup update script already runs
`bun install`. Use Bun for everything:

- Install: `bun install` (CI uses `bun install --frozen-lockfile`)
- Dev server: `bun run dev` (Next dev on http://localhost:3000)
- Tests: `bun run test` (Vitest, 227 tests; see `package.json`)
- Build: `bun run build`
- Lint: `bun run lint`

Bun lives at `~/.bun/bin/bun`. If `bun` is not found, prefix commands with
`PATH="$HOME/.bun/bin:$PATH"`.

### Non-obvious gotchas

- **Lint currently fails on the unmodified tree** (pre-existing errors +
  warnings) and is intentionally non-blocking: `next.config.ts` sets
  `eslint.ignoreDuringBuilds` and `.github/workflows/ci.yml` keeps lint/type-check
  disabled. `bun run lint` working ≠ zero problems — don't "fix" these unless asked.
- **The dev server needs Supabase env vars even for the homepage.** `src/middleware.ts`
  constructs a Supabase client for `/`, so with no `.env.local` every page 500s.
  A local `.env.local` (gitignored) pointing at the local Supabase stack is
  expected in this environment.
- **`bun run build` needs placeholder env** or it crashes on the `/blog` static
  prerender + middleware. Use the same placeholders CI uses (see the `Build` step
  in `.github/workflows/ci.yml`): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER/PRO/PREMIUM`.
- **`ALLOWED_EMAILS` is a hard beta gate.** Empty = deny everyone (`src/lib/allowlist.ts`).
  Set it to your login email in `.env.local` or every authenticated page/API returns
  `/unauthorized` / 403.

### Running a full local backend (Supabase) for auth/DB work

Marketing pages render with any Supabase URL, but exercising auth + data
(login, dashboard, projects) needs a real backend. This environment uses a
**local Supabase stack via Docker** (no cloud project or secrets required):

1. Start the Docker daemon (not auto-started on boot): `sudo dockerd &`
   (config already set to `fuse-overlayfs`; socket may need `sudo chmod 666 /var/run/docker.sock`).
2. Start Supabase: `bunx supabase start` (config lives in `supabase/config.toml`,
   created by `supabase init`; both it and `.env.local` are gitignored).
3. **Migrations gotcha:** `supabase/migrations/` has duplicate version prefixes
   (`011_*` and `018_*`), which makes `supabase start`/`db reset` abort with a
   `schema_migrations_pkey` duplicate-key error. Work around it by starting with an
   empty migrations dir and applying the SQL directly, e.g.:
   `for f in $(ls supabase/migrations/*.sql | sort); do docker exec -i supabase_db_workspace psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$f"; done`
   Then grant the standard Supabase roles (needed because applying as `postgres`
   skips Supabase's default DML grants):
   `grant all on all tables/sequences/functions in schema public to anon, authenticated, service_role;`
4. `.env.local` should set `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` plus the
   local anon + service_role keys from `bunx supabase status -o env`, and
   `ALLOWED_EMAILS=<your test email>`.

### Local login (magic link)

There is no password login — only Google OAuth (needs external setup) and email
magic links. The app's `/auth/confirm` route verifies a `token_hash`. Locally,
mint one with the admin API and open the confirm URL directly (equivalent to
clicking the email link):

```
POST http://127.0.0.1:54321/auth/v1/admin/generate_link   (service_role key)
  body: {"type":"magiclink","email":"<allowed email>"}
# then open:
http://localhost:3000/auth/confirm?token_hash=<hashed_token>&type=magiclink&next=/dashboard
```

Outbound magic-link emails from the normal `/api/auth/magic-link` flow land in
Mailpit at http://127.0.0.1:54324. Rate-limit counters live in Postgres
(`rate_limit_counters`) and fail closed; clear that table if you get spurious 429s
while testing.
