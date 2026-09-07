import { mkdir, readFile, writeFile, rm } from "fs/promises";
import path from "path";

export interface StorageResult {
  data: Buffer;
  contentType: string;
}

export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StorageResult | null>;
  delete(key: string): Promise<void>;
}

const UPLOADS_ROOT = path.join(process.cwd(), "uploads");

// Reject anything that could escape the uploads root: `..` segments, a
// leading slash (absolute path), a null byte (can truncate paths on some
// platforms/APIs), or backslashes (Windows-style traversal).
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
async function put(key: string, data: Buffer, contentType: string): Promise<void> {
  const { filePath, metaPath } = resolvePaths(key);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(/* turbopackIgnore: true */ filePath, data);
  await writeFile(/* turbopackIgnore: true */ metaPath, JSON.stringify({ contentType }), "utf8");
}

async function get(key: string): Promise<StorageResult | null> {
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
}

async function del(key: string): Promise<void> {
  const { filePath, metaPath } = resolvePaths(key);
  await Promise.all(
    [filePath, metaPath].map((p) => rm(/* turbopackIgnore: true */ p, { force: true })),
  );
}

export const storage: Storage = { put, get, delete: del };
