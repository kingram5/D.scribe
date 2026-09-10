import * as Sentry from "@sentry/nextjs";
import { analytics } from "@heycatch/sdk";
import { scrubEvent } from "./sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
});

// HeyCatch (2026-09-10). This file is the app's client entry (Next loads it once,
// before hydration, on every page), so the SDK is initialised here at module
// scope exactly like Sentry above. Per https://heycatch.ai/agents.md: static
// import, no window guard, no once-flag (init is idempotent and a no-op during
// SSR), key inlined as a literal (a bad key does not throw, it logs [HeyCatch]
// and sends nothing), and no apiHost. Identity + business events live in
// src/lib/heycatch.ts; the CSP allowance is in next.config.ts.
analytics.init({
  projectKey: "hck_pk_RYdVY2TnfPu8AU-LHCxQFZni5hpjkzVH",
  install: { framework: "nextjs", frameworkVersion: "15", agent: "claude-code" },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
