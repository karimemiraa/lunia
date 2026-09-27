// Expense receipt uploads. Receipts are finance documents, so they go under
// the private "finance/" storage prefix, which /api/media refuses to serve
// (see isPrivateStorageKey in src/lib/storage.ts); the only way to read one is
// the permission-checked /admin/accounting/expenses/[id]/receipt route.

import { randomUUID } from "node:crypto";
import { storage } from "@/lib/storage";

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

// Derived from the validated mime type, never the client filename, so a
// crafted name can't influence the storage key. No SVG (active content).
const RECEIPT_EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export const RECEIPT_ACCEPT = Object.keys(RECEIPT_EXTENSIONS).join(",");

export type ReceiptCheck = { ok: true; mimeType: string; ext: string } | { ok: false; error: string };

export function checkReceiptFile(file: { type: string; size: number }): ReceiptCheck {
  const mimeType = (file.type || "").toLowerCase();
  const ext = RECEIPT_EXTENSIONS[mimeType];
  if (!ext) return { ok: false, error: "Receipts must be a PDF or a photo (JPG, PNG, WebP, HEIC)." };
  if (file.size > RECEIPT_MAX_BYTES) return { ok: false, error: "Receipt is too large (max 10MB)." };
  return { ok: true, mimeType, ext };
}

/** Stores a validated receipt and returns its private storage key. */
export async function storeReceipt(data: Buffer, mimeType: string, ext: string): Promise<string> {
  const key = `finance/receipts/${randomUUID()}.${ext}`;
  await storage.put(key, data, mimeType);
  return key;
}

export async function deleteReceipt(key: string): Promise<void> {
  await storage.delete(key).catch(() => undefined);
}
