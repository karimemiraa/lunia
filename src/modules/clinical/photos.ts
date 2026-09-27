// Clinical photos (before/after, skin-analyzer exports). PRIVATE: bytes live
// under the "clinical/" storage prefix, which the public /api/media route
// refuses; they are served only by /admin/clinical/photo/[id], which checks
// clinical:manage. The storage key is generated server-side (never from the
// client's filename).
//
// No image library is a direct dependency, so the server stores bytes as
// received. The upload UI re-encodes photos in the browser (canvas) before
// sending, which downsizes them and drops EXIF (GPS, device serials) while
// keeping the visual orientation.

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";

export const PHOTO_KINDS = ["BEFORE", "AFTER", "ANALYSIS", "OTHER"] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
export const ALLOWED_PHOTO_MIME = Object.keys(EXT_BY_MIME);

export const photoMetaSchema = z.object({
  clientProfileId: z.string().min(1),
  kind: z.enum(PHOTO_KINDS).default("OTHER"),
  area: z.string().trim().max(80).optional().nullable(),
  device: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  treatmentRecordId: z
    .string()
    .trim()
    .transform((v) => v || null)
    .optional()
    .nullable(),
  takenAt: z.coerce.date().optional().nullable(),
  uploadedById: z.string().min(1),
});
export type PhotoMetaInput = z.input<typeof photoMetaSchema>;

// Sniffs the real format from magic bytes: the browser-supplied mime type is
// only a hint and could be anything.
export function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heif"].includes(brand)) return "image/heif";
  }
  return null;
}

export async function uploadClinicalPhoto(meta: PhotoMetaInput, bytes: Buffer) {
  const data = photoMetaSchema.parse(meta);
  if (bytes.length === 0) throw new Error("Empty file");
  if (bytes.length > MAX_PHOTO_BYTES) throw new Error("Photo is too large (max 20MB)");
  const mime = sniffImageMime(bytes);
  if (!mime) throw new Error("Only JPG, PNG, WebP or HEIC images are allowed");

  if (data.treatmentRecordId) {
    const record = await prisma.treatmentRecord.findUnique({ where: { id: data.treatmentRecordId }, select: { clientProfileId: true } });
    if (!record || record.clientProfileId !== data.clientProfileId) throw new Error("Treatment record not found");
  }

  const storageKey = `clinical/${data.clientProfileId}/${randomUUID()}.${EXT_BY_MIME[mime]}`;
  await storage.put(storageKey, bytes, mime);
  try {
    return await prisma.clinicalPhoto.create({
      data: {
        clientProfileId: data.clientProfileId,
        treatmentRecordId: data.treatmentRecordId ?? null,
        storageKey,
        mime,
        kind: data.kind,
        area: data.area || null,
        device: data.device || null,
        note: data.note || null,
        uploadedById: data.uploadedById,
        takenAt: data.takenAt ?? new Date(),
      },
    });
  } catch (err) {
    // Never leave an orphaned private file behind.
    await storage.delete(storageKey).catch(() => undefined);
    throw err;
  }
}

export async function listClinicalPhotos(clientProfileId: string) {
  return prisma.clinicalPhoto.findMany({
    where: { clientProfileId },
    orderBy: { takenAt: "desc" },
    select: {
      id: true,
      kind: true,
      area: true,
      device: true,
      note: true,
      mime: true,
      treatmentRecordId: true,
      takenAt: true,
      createdAt: true,
    },
  });
}

export async function getClinicalPhoto(id: string) {
  return prisma.clinicalPhoto.findUnique({ where: { id } });
}

export async function updateClinicalPhotoMeta(
  id: string,
  input: { kind?: PhotoKind; area?: string | null; note?: string | null; treatmentRecordId?: string | null },
) {
  const data = z
    .object({
      kind: z.enum(PHOTO_KINDS).optional(),
      area: z.string().trim().max(80).nullable().optional(),
      note: z.string().trim().max(500).nullable().optional(),
      treatmentRecordId: z.string().nullable().optional(),
    })
    .parse(input);
  const photo = await prisma.clinicalPhoto.findUnique({ where: { id }, select: { clientProfileId: true } });
  if (!photo) throw new Error("Photo not found");
  if (data.treatmentRecordId) {
    const record = await prisma.treatmentRecord.findUnique({ where: { id: data.treatmentRecordId }, select: { clientProfileId: true } });
    if (!record || record.clientProfileId !== photo.clientProfileId) throw new Error("Treatment record not found");
  }
  return prisma.clinicalPhoto.update({ where: { id }, data });
}

export async function deleteClinicalPhoto(id: string) {
  const photo = await prisma.clinicalPhoto.findUnique({ where: { id } });
  if (!photo) return null;
  await prisma.clinicalPhoto.delete({ where: { id } });
  await storage.delete(photo.storageKey).catch(() => undefined);
  return photo;
}
