// One-off: set CORS policy on the R2 audio bucket (browser presigned uploads).
// Run from repo root with the repo's node_modules: node scripts/fix-r2-cors.mjs
import { readFileSync } from "node:fs";
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";

const env = readFileSync(".env.local", "utf8");
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, "m"));
  if (!m) throw new Error(`missing ${k} in .env.local`);
  return m[1].trim();
};

const R2_ACCOUNT_ID = get("R2_ACCOUNT_ID");
const R2_BUCKET_NAME = get("R2_BUCKET_NAME");

const client = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: get("R2_ACCESS_KEY_ID"), secretAccessKey: get("R2_SECRET_ACCESS_KEY") },
});

// AllowedOrigins: production + any deploy preview (*.vercel.app) so staging uploads work too.
const cors = {
  CORSRules: [
    {
      AllowedOrigins: ["https://www.d-scribe.app", "https://d-scribe.app", "https://*.vercel.app", "http://localhost:3000"],
      AllowedMethods: ["PUT", "GET", "HEAD"],
      AllowedHeaders: ["content-type", "x-amz-content-sha256", "x-amz-date", "authorization"],
      MaxAgeSeconds: 3600,
    },
  ],
};

await client.send(new PutBucketCorsCommand({ Bucket: R2_BUCKET_NAME, CORSConfiguration: cors }));
console.log("CORS applied to", R2_BUCKET_NAME);
