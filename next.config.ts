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
    // Deferred (need feature-usage verification + a build test): Permissions-Policy
    // (D.Scribe may use the mic for audio), HSTS `preload`, and a Content-Security-Policy.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
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
