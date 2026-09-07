"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { MediaKind } from "@prisma/client";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { storage } from "@/lib/storage";
import { getImageDimensions } from "@/lib/imageDimensions";
import { createMedia, updateMediaAlt, deleteMedia } from "@/modules/cms/media";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/ogg": "ogv",
};

// Derives a safe file extension from the (validated) mime type — never from
// client-supplied input — for use in the server-generated storage key.
function extensionForMime(mimeType: string): string {
  const known = EXTENSION_BY_MIME[mimeType];
  if (known) return known;
  const subtype = mimeType.split("/")[1] ?? "bin";
  const safe = subtype.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return safe.length > 0 ? safe.slice(0, 10) : "bin";
}

export interface UploadState {
  error?: string;
}

// Uploads a new media asset. The storage key is generated server-side
// (random UUID + extension derived from the validated mime type) rather than
// from the client's filename, so a crafted filename can't be used to
// traverse or collide with paths in the uploads root.
export async function uploadMedia(_prev: UploadState | null, formData: FormData): Promise<UploadState> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }

  const mimeType = file.type || "application/octet-stream";
  const kind: MediaKind | null = mimeType.startsWith("image/")
    ? "IMAGE"
    : mimeType.startsWith("video/")
      ? "VIDEO"
      : null;

  if (!kind) {
    return { error: "Only image or video files are allowed." };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "File is too large (max 25MB)." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storageKey = `media/${randomUUID()}.${extensionForMime(mimeType)}`;

  await storage.put(storageKey, buffer, mimeType);

  const dimensions = kind === "IMAGE" ? getImageDimensions(buffer) : null;

  try {
    await createMedia({
      kind,
      storageKey,
      filename: file.name || storageKey,
      mimeType,
      sizeBytes: file.size,
      width: dimensions?.width,
      height: dimensions?.height,
    });
  } catch (err) {
    // Don't leave an orphaned blob behind if the DB insert fails.
    await storage.delete(storageKey);
    throw err;
  }

  revalidatePath("/admin/media");
  return {};
}

export async function updateAlt(formData: FormData): Promise<void> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const altEn = String(formData.get("altEn") ?? "").trim();
  const altAr = String(formData.get("altAr") ?? "").trim();

  await updateMediaAlt(id, { altEn, altAr });
  revalidatePath("/admin/media");
}

export async function deleteMediaAction(formData: FormData): Promise<void> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await deleteMedia(id);
  revalidatePath("/admin/media");
}
