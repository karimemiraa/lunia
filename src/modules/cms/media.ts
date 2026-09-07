import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import type { MediaAsset, MediaKind } from "@prisma/client";

export interface CreateMediaInput {
  kind: MediaKind;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  altEn?: string;
  altAr?: string;
  uploadedById?: string;
}

export interface UpdateMediaAltInput {
  altEn?: string;
  altAr?: string;
}

// Inserts a MediaAsset row. Does NOT upload bytes itself — the upload
// endpoint is expected to call storage.put(...) first, then this.
export async function createMedia(input: CreateMediaInput): Promise<MediaAsset> {
  return prisma.mediaAsset.create({ data: input });
}

export async function listMedia(): Promise<MediaAsset[]> {
  // Order by createdAt desc, tie-broken by id desc, so callers get a
  // deterministic order even when multiple rows share the same createdAt
  // timestamp (e.g. seeded/test data created in the same millisecond).
  return prisma.mediaAsset.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
}

export async function getMedia(id: string): Promise<MediaAsset | null> {
  return prisma.mediaAsset.findUnique({ where: { id } });
}

export async function updateMediaAlt(id: string, input: UpdateMediaAltInput): Promise<MediaAsset> {
  return prisma.mediaAsset.update({ where: { id }, data: input });
}

// Deletes the DB row and the underlying storage object. If the asset does
// not exist, this is a no-op (nothing to delete on either side).
export async function deleteMedia(id: string): Promise<void> {
  const media = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!media) return;
  await prisma.mediaAsset.delete({ where: { id } });
  await storage.delete(media.storageKey);
}
