/**
 * Cloudflare R2 utilities for audio file storage
 *
 * Uses S3-compatible API with presigned URLs for direct client uploads.
 * Files bypass Vercel entirely — browser → R2 directly.
 *
 * Dynamic imports used to prevent @aws-sdk from bloating the server module graph.
 */

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "dscribe-audio";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _s3Client: any = null;

async function getS3Client() {
  if (_s3Client) return _s3Client;
  const { S3Client } = await import("@aws-sdk/client-s3");
  _s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  return _s3Client;
}

/**
 * Generate a presigned URL for direct client upload to R2.
 *
 * sizeBytes is an EXACT match, not a maximum — ContentLength is signed, so the
 * PUT body must be exactly this size. Content-Type is also forced into the
 * signature (by default the presigner signed only content-length + host,
 * which left the MIME allowlist purely advisory): the client must PUT with
 * exactly the contentType declared here.
 */
export async function getUploadUrl(key: string, contentType: string, sizeBytes: number = 500 * 1024 * 1024) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const s3 = await getS3Client();

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ContentLength: sizeBytes,
  });

  const url = await getSignedUrl(s3, command, {
    expiresIn: 3600,
    signableHeaders: new Set(["content-type", "content-length", "host"]),
  });
  return url;
}

/**
 * HEAD an object — lets confirm-upload verify the file actually landed
 * instead of recording the client's claim as fact.
 */
export async function headObject(key: string): Promise<{ exists: boolean; sizeBytes: number | null; contentType: string | null }> {
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = await getS3Client();
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    return { exists: true, sizeBytes: res.ContentLength ?? null, contentType: res.ContentType ?? null };
  } catch (err) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404) {
      return { exists: false, sizeBytes: null, contentType: null };
    }
    throw err;
  }
}

/**
 * Generate a presigned URL for downloading/reading a file from R2
 */
export async function getDownloadUrl(key: string) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
  const s3 = await getS3Client();

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
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = await getS3Client();

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
  return null;
}
