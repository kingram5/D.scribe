import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
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

export default nextConfig;
