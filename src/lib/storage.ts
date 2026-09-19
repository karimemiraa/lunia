import { mkdir, readFile, writeFile, rm } from "fs/promises";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

export interface StorageResult {
  data: Buffer;
  contentType: string;
}

export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StorageResult | null>;
  delete(key: string): Promise<void>;
}

// Reject anything that could escape the uploads root / be an unsafe object
// key: `..` segments, a leading slash (absolute path), a null byte (can
// truncate paths on some platforms/APIs), or backslashes (Windows-style
// traversal). Applied on every backend so keys are always well-formed.
function assertSafeKey(key: string): void {
  if (
    key.length === 0 ||
    key.includes("\0") ||
    key.startsWith("/") ||
    key.includes("\\") ||
    key.split("/").includes("..")
  ) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

// --- Local filesystem backend (dev/test) ------------------------------------
// Uploaded bytes live under <cwd>/uploads with a sidecar .meta file recording
// the content type.

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

function resolvePaths(key: string): { filePath: string; metaPath: string } {
  assertSafeKey(key);
  const filePath = path.join(UPLOADS_ROOT, key);
  // Defense in depth: confirm the resolved path is still inside the uploads
  // root even after sanitization above.
  const relative = path.relative(UPLOADS_ROOT, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
  return { filePath, metaPath: `${filePath}.meta` };
}

// The build-time bundler (Turbopack) statically scans fs calls to decide
// what to trace into the standalone output; a runtime-computed path makes it
// give up and trace the *entire* project instead. These paths are already
// confined to UPLOADS_ROOT by resolvePaths()/assertSafeKey() above, so the
// dynamic access is safe — silence the tracer with turbopackIgnore rather
// than let every source file get bundled into the server output.
const localStorage: Storage = {
  async put(key, data, contentType) {
    const { filePath, metaPath } = resolvePaths(key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(/* turbopackIgnore: true */ filePath, data);
    await writeFile(/* turbopackIgnore: true */ metaPath, JSON.stringify({ contentType }), "utf8");
  },
  async get(key) {
    const { filePath, metaPath } = resolvePaths(key);
    try {
      const [data, metaRaw] = await Promise.all([
        readFile(/* turbopackIgnore: true */ filePath),
        readFile(/* turbopackIgnore: true */ metaPath, "utf8"),
      ]);
      const { contentType } = JSON.parse(metaRaw) as { contentType: string };
      return { data, contentType };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  },
  async delete(key) {
    const { filePath, metaPath } = resolvePaths(key);
    await Promise.all(
      [filePath, metaPath].map((p) => rm(/* turbopackIgnore: true */ p, { force: true })),
    );
  },
};

// --- Backblaze B2 (S3-compatible) backend -----------------------------------
// Uploaded media is stored in a private B2 bucket. The app still serves it
// through /api/media/<key> (which calls storage.get), so the bucket can stay
// private — no public bucket or presigned URLs needed. Content type is stored
// as the object's native S3 ContentType (no sidecar file).

interface S3Config {
  bucket: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// Reads B2/S3 config from the environment. Returns null when it isn't fully
// configured, so the app falls back to the local backend (dev/CI).
function readS3Config(env: NodeJS.ProcessEnv): S3Config | null {
  const bucket = env.B2_BUCKET ?? env.S3_BUCKET;
  const endpointRaw = env.B2_ENDPOINT ?? env.S3_ENDPOINT;
  const region = env.B2_REGION ?? env.S3_REGION ?? "us-east-1";
  const accessKeyId = env.B2_KEY_ID ?? env.S3_ACCESS_KEY_ID;
  const secretAccessKey = env.B2_APP_KEY ?? env.S3_SECRET_ACCESS_KEY;
  if (!bucket || !endpointRaw || !accessKeyId || !secretAccessKey) return null;
  // Accept an endpoint with or without a scheme (the B2 console shows it bare,
  // e.g. "s3.eu-central-003.backblazeb2.com").
  const endpoint = /^https?:\/\//.test(endpointRaw) ? endpointRaw : `https://${endpointRaw}`;
  return { bucket, endpoint, region, accessKeyId, secretAccessKey };
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  // AWS SDK v3 (Node) bodies expose transformToByteArray(); prefer it.
  const maybe = body as { transformToByteArray?: () => Promise<Uint8Array> } | null;
  if (maybe && typeof maybe.transformToByteArray === "function") {
    return Buffer.from(await maybe.transformToByteArray());
  }
  // Fallback: async-iterable stream of chunks.
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function makeS3Storage(config: S3Config): Storage {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Path-style addressing is the most compatible with B2's S3 endpoint.
    forcePathStyle: true,
  });

  return {
    async put(key, data, contentType) {
      assertSafeKey(key);
      await client.send(
        new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: data, ContentType: contentType }),
      );
    },
    async get(key) {
      assertSafeKey(key);
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        if (!res.Body) return null;
        const data = await streamToBuffer(res.Body);
        return { data, contentType: res.ContentType ?? "application/octet-stream" };
      } catch (err) {
        const name = (err as { name?: string }).name;
        const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (name === "NoSuchKey" || name === "NotFound" || status === 404) return null;
        throw err;
      }
    },
    async delete(key) {
      assertSafeKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}

// --- Backend selection ------------------------------------------------------
// Uses B2/S3 when configured (production), otherwise the local filesystem
// (dev/CI). STORAGE_DRIVER=local can force the local backend even if S3 vars
// are present (e.g. a debugging session).

function selectStorage(): Storage {
  if (process.env.STORAGE_DRIVER === "local") return localStorage;
  const s3 = readS3Config(process.env);
  return s3 ? makeS3Storage(s3) : localStorage;
}

export const storage: Storage = selectStorage();
