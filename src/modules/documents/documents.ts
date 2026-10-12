// Visit documents: arbitrary files attached to a visit (booking) and
// optionally one appointment — receipts, lab results, signed forms, reports,
// IDs. PRIVATE: bytes live under the "documents/" storage prefix (refused by
// the public /api/media route) and are served only by the permission-checked
// /admin/documents/[id] route. The storage key is generated server-side; the
// original file name is kept only for display/download.

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { sniffImageMime } from "@/modules/clinical/photos";

export const DOCUMENT_CATEGORIES = ["RECEIPT", "LAB", "FORM", "REPORT", "ID", "OTHER"] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

// PDFs and images only: these cover receipts, scanned/photographed forms, lab
// reports and IDs, and can be sniffed from magic bytes (the browser-supplied
// mime is only a hint). Office formats (docx/xlsx) would need a separate,
// non-sniffable allowlist — deliberately out of scope here.
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};
export const ALLOWED_DOCUMENT_MIME = Object.keys(EXT_BY_MIME);

// Sniffs the real format from magic bytes. PDFs start with "%PDF"; images
// reuse the photo sniffer.
function sniffDocumentMime(buf: Buffer): string | null {
  if (buf.length >= 5 && buf.toString("ascii", 0, 5) === "%PDF-") return "application/pdf";
  return sniffImageMime(buf);
}

// Keeps a readable, safe display name: strips any path, control chars and
// leading dots, caps the length. Never used as (part of) the storage key.
function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? raw;
  const cleaned = base.replace(/[\u0000-\u001f]/g, "").replace(/^\.+/, "").trim();
  return (cleaned || "document").slice(0, 160);
}

const metaSchema = z.object({
  clientProfileId: z.string().min(1),
  bookingId: z.string().trim().transform((v) => v || null).optional().nullable(),
  appointmentId: z.string().trim().transform((v) => v || null).optional().nullable(),
  category: z.enum(DOCUMENT_CATEGORIES).default("OTHER"),
  note: z.string().trim().max(500).optional().nullable(),
  fileName: z.string().min(1).max(260),
  uploadedById: z.string().min(1),
});
export type DocumentMetaInput = z.input<typeof metaSchema>;

export async function uploadVisitDocument(meta: DocumentMetaInput, bytes: Buffer) {
  const data = metaSchema.parse(meta);
  if (bytes.length === 0) throw new Error("Empty file");
  if (bytes.length > MAX_DOCUMENT_BYTES) throw new Error("File is too large (max 25MB)");
  const mime = sniffDocumentMime(bytes);
  if (!mime) throw new Error("Only PDF, JPG, PNG, WebP or HEIC files are allowed");

  const storageKey = `documents/${data.clientProfileId}/${randomUUID()}.${EXT_BY_MIME[mime]}`;
  await storage.put(storageKey, bytes, mime);
  try {
    return await prisma.visitDocument.create({
      data: {
        clientProfileId: data.clientProfileId,
        bookingId: data.bookingId ?? null,
        appointmentId: data.appointmentId ?? null,
        storageKey,
        fileName: sanitizeFileName(data.fileName),
        mime,
        sizeBytes: bytes.length,
        category: data.category,
        note: data.note || null,
        uploadedById: data.uploadedById,
      },
    });
  } catch (err) {
    // Never leave an orphaned private file behind.
    await storage.delete(storageKey).catch(() => undefined);
    throw err;
  }
}

/** Documents attached to one visit (booking), newest first. */
export async function listVisitDocuments(bookingId: string) {
  return prisma.visitDocument.findMany({
    where: { bookingId },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, mime: true, sizeBytes: true, category: true, note: true, createdAt: true },
  });
}

export async function getVisitDocument(id: string) {
  return prisma.visitDocument.findUnique({ where: { id } });
}

export async function deleteVisitDocument(id: string) {
  const doc = await prisma.visitDocument.findUnique({ where: { id } });
  if (!doc) return null;
  await prisma.visitDocument.delete({ where: { id } });
  await storage.delete(doc.storageKey).catch(() => undefined);
  return doc;
}
