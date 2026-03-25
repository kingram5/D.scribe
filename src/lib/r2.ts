/**
 * Cloudflare R2 utilities for audio file storage
 *
 * Uses S3-compatible API with presigned URLs for direct client uploads.
 * Files bypass Vercel entirely — browser → R2 directly.
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "dscribe-audio";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate a presigned URL for direct client upload to R2
 */
export async function getUploadUrl(key: string, contentType: string, maxSizeBytes: number = 500 * 1024 * 1024) {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ContentLength: maxSizeBytes,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour expiry
  return url;
}

/**
 * Generate a presigned URL for downloading/reading a file from R2
 */
export async function getDownloadUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  return await getSignedUrl(s3, command, { expiresIn: 3600 });
}

/**
 * Delete a file from R2
 */
export async function deleteFile(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  await s3.send(command);
}

/**
 * Get the public URL for a file (if bucket has public access enabled)
 * Falls back to presigned URL if no custom domain
 */
export function getPublicUrl(key: string) {
  const customDomain = process.env.R2_PUBLIC_DOMAIN;
  if (customDomain) {
    return `https://${customDomain}/${key}`;
  }
  // No public access — use presigned URLs instead
  return null;
}
