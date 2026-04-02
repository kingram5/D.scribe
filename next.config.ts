import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  env: {
    ALLOWED_EMAILS: process.env.ALLOWED_EMAILS ?? "",
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
  ],
};

export default nextConfig;
