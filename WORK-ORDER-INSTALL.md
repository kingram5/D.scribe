# Work Order — HeyCatch SDK install (D.scribe)

**From:** Answer (Hermes) · **Date:** 2026-09-10
**Authority:** Kyle supplied the official install prompt from the HeyCatch Install page, plus the project key.
**Spec:** `https://heycatch.ai/agents.md` — follow it exactly. Read it yourself before editing.

Project key: `hck_pk_RYdVY2TnfPu8AU-LHCxQFZni5hpjkzVH`
Repo: this worktree. Branch `marketing/heycatch-quick-wins`.

## Do not break

- Do not deploy. Do not merge. Do not push.
- Do not touch billing logic, the Ink ledger, or `PUBLIC_SIGNUP` behavior.

## Step 1 — install the package

Add `@heycatch/sdk` as a regular dependency at the **latest** dist-tag.

- Resolve with `npm view @heycatch/sdk version`, or GET `https://registry.npmjs.org/@heycatch/sdk/latest` and read `version`.
- Never install a `-dev.N`, `-beta.N`, or `-rc.N` build. A `-dev.N` build silently sends every event to a non-production backend, and "most recently published" is not "latest".

## Step 2 — `init` once, at module scope, in the client entry

- Static import only. No `import()`, no `next/dynamic`, no lazy chunk.
- No `typeof window` guard, no once-flag. `init` is idempotent and a no-op during SSR.
- Inline the key as a literal. Do not route it through an env var; a bad key does not throw, it logs `[HeyCatch]` and sends zero events.
- Do not pass `apiHost`.
- Pass `install: { framework: 'nextjs', frameworkVersion: '<detected major>', agent: 'claude-code' }`.
- Find the existing client entry pattern in this repo and match it. If the app already has a providers/analytics entry, add there rather than inventing a second one.

**CSP check:** this repo sets security headers (see `next.config.ts` and `src/middleware.ts`). If a Content-Security-Policy is in force, it must allow `https://in.heycatch.ai` for both `script-src` (or its fallback) and `connect-src` (or its fallback). The SDK sends events there and loads one helper script from there at runtime. Report exactly what you changed.

## Step 3 — identity and business events

This app authenticates with Supabase Auth via Google OAuth — a client-only flow with no server route in the sign-in path, so autocapture alone will not produce a funnel.

- Call `setIdentity(<stable internal user id>, { email, name })` where the app detects a signed-in session. Never pass an email or a session token as the id; email and name belong in the properties.
- Call `analytics.resetIdentity()` on sign-out.
- Call `analytics.trackEvent('signup_completed')` once, at the point of first confirmed session.
- If a subscription outcome is known client-side, emit `subscription_started` with the plan. Where the outcome is only known server-side, use a server route handler and `init` at module scope there.

Do not duplicate events that autocapture already reports correctly.

## Step 4 — short links

Add the host redirect rule in `next.config.ts`:

```js
async redirects() {
  return [
    {
      source: '/:l([a-z0-9])',
      destination: '/?utm_source=heycatch&utm_campaign=:l',
      permanent: false,
    },
  ];
}
```

The query string is the attribution; a bare redirect to `/` loses it. Test that `/x` returns a 302 (not a 404) once built.

## Step 5 — verify for real

1. `npx tsc --noEmit` — must exit 0.
2. `npm run build` — must exit 0.
3. Start the dev server, load a page in a real browser, and click around for a few seconds. A scripted browser makes a working install read as broken, so use an ordinary page load.
4. Confirm the console logs `[HeyCatch] SDK v<version> (prod) initialized → <apiHost>`. The stage must read `(prod)` and the version must be a plain `x.y.z` with no `-` suffix. A `(dev)` stage or a `-dev.N` version means redo step 1.
5. Confirm `/x` resolves through the redirect rule.

## Report

Write `./HEYCATCH-INSTALL-REPORT.md` in this worktree root with: the resolved SDK version, every file touched, the exact CSP/header change, the real console line from step 4, the `/x` status code, and the actual `tsc` and `build` exit codes. Anything you could not run, say so plainly rather than implying success. Do not claim dashboard verification — pressing "I've installed" in the HeyCatch dashboard happens after a deploy, which is Kyle's call.
