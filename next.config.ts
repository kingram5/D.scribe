import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Type errors now FAIL the build (the tree is tsc-clean as of the launch-hardening
  // pass). ESLint stays suppressed until the zod / eslint-config-next toolchain
  // crash is resolved — see the lint TODO in .github/workflows/ci.yml.
  eslint: { ignoreDuringBuilds: true },
  env: {
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS ?? "",
  },
  async headers() {
    // Baseline security headers on every route. Conservative, safe-for-Vercel set.
    //
    // 2026-09-08 launch hardening:
    //  - Permissions-Policy: the brainstorm mic is the only powerful feature D.scribe
    //    uses, so the microphone stays allowed for our own origin and everything else
    //    (camera, geolocation, payment, USB, ...) is switched off.
    //  - Content-Security-Policy-Report-Only: every host the app talks to is listed
    //    below; violations are REPORTED to Sentry (never blocked) so a week of clean
    //    reports proves the allowlist before it is promoted to an enforcing
    //    Content-Security-Policy. Promote by renaming the header key.
    // The DSN is public by design (it ships in the client bundle); the fallback keeps CSP reports
    // flowing even when the env var is unset or carries stray whitespace at build time.
    const sentryDsn = (process.env.NEXT_PUBLIC_SENTRY_DSN ?? "").trim() || "https://0148486c495a26dc3068b6095aabeeae@o4511312415358976.ingest.us.sentry.io/4511312418373632";
    const dsn = sentryDsn.match(/^https:\/\/([^@]+)@([^/]+)\/(\d+)$/);
    const cspReportUri = dsn ? `https://${dsn[2]}/api/${dsn[3]}/security/?sentry_key=${dsn[1]}` : "";
    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self' https://checkout.stripe.com https://accounts.google.com",
      // 'unsafe-inline' / 'unsafe-eval' are what Next.js, TipTap and the pixel loaders need today; tighten with nonces later.
      // https://in.heycatch.ai (2026-09-10): the HeyCatch SDK posts events there and loads one helper script from there at runtime.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://analytics.tiktok.com https://snap.licdn.com https://accounts.google.com https://in.heycatch.ai",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https: ",
      "media-src 'self' blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co wss://api.deepgram.com https://api.deepgram.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://analytics.tiktok.com https://px.ads.linkedin.com https://www.googleapis.com https://oauth2.googleapis.com https://api.stripe.com https://in.heycatch.ai",
      "frame-src 'self' https://js.stripe.com https://checkout.stripe.com https://accounts.google.com https://docs.google.com",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests",
      cspReportUri ? `report-uri ${cspReportUri}` : "",
    ].filter(Boolean).join("; ");
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), bluetooth=(), display-capture=(), interest-cohort=()" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ],
      },
    ];
  },
  // HeyCatch short links (2026-09-10, rule verbatim from https://heycatch.ai/agents.md):
  // /x style one-character paths carry the attribution into the query string.
  // Redirects resolve before middleware in Next's routing order, so the auth
  // gate never sees /x. `permanent: false` is a 307 in Next.js (temporary,
  // method-preserving); a literal 302 would need `statusCode: 302` instead.
  async redirects() {
    return [
      {
        source: '/:l([a-z0-9])',
        destination: '/?utm_source=heycatch&utm_campaign=:l',
        permanent: false,
      },
    ];
  },
  serverExternalPackages: [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "@deepgram/sdk",
    "@tiptap/react",
    "@tiptap/starter-kit",
    "@xyflow/react",
    "jspdf",
    "docx",
    "pino",
    "pino-pretty",
    "@axiomhq/pino",
  ],
};

// Source-map upload + release tracking via the Sentry build plugin. Uploads only
// when SENTRY_AUTH_TOKEN is present (set it in Vercel env) — no-ops gracefully
// otherwise — so prod stack traces stop showing as minified gibberish. The
// tunnelRoute proxies Sentry through our own domain so ad-blockers don't eat events.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  tunnelRoute: "/monitoring",
  widenClientFileUpload: true,
  disableLogger: true,
});
