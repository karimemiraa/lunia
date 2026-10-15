"use server";

// Server actions for the Appointment Hub's visit-scoped comment thread.
// Comments are VisitNotes tagged with this visit's bookingId (so they show on
// the hub) while still belonging to the customer (so they also show on the
// Customer 360). Every action re-checks its own permission first and
// revalidates the hub path so a following router.refresh() picks up the
// change. Mirrors admin/clients/[id]/actions.ts's note actions.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { prisma } from "@/lib/db";
import { addVisitNote, deleteVisitNote, setNotePinned } from "@/modules/crm/visitNotes";
import { getStaffT } from "../../_i18n/display";
import { errorText } from "../actionError";
import { uploadVisitDocument, deleteVisitDocument, DOCUMENT_CATEGORIES, MAX_DOCUMENT_BYTES, type DocumentCategory } from "@/modules/documents/documents";

export interface HubActionState {
  error?: string;
  success?: boolean;
}

function revalidateHub(appointmentId: string): void {
  revalidatePath(`/admin/calendar/${appointmentId}`);
}

export async function addHubCommentAction(_prev: HubActionState | null, formData: FormData): Promise<HubActionState> {
  const admin = await requireAdmin(PERMISSIONS.VISITNOTE_WRITE);

  const appointmentId = String(formData.get("appointmentId") ?? "").trim();
  const clientProfileId = String(formData.get("clientProfileId") ?? "").trim();
  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!appointmentId || !clientProfileId || !bookingId) return { error: (await getStaffT())("Missing appointment.") };
  if (!body) return { error: (await getStaffT())("Comment cannot be empty.") };

  try {
    await addVisitNote({ clientProfileId, bookingId, authorUserId: admin.id, body });
  } catch (err) {
    return { error: await errorText(err, "Failed to add comment.") };
  }

  revalidateHub(appointmentId);
  return { success: true };
}

// Deletion: the note's author, or any staff holding CLIENT_MANAGE (same rule
// as the Customer 360's delete, per visitNotes.ts's deleteVisitNote carve-out).
export async function deleteHubCommentAction(_prev: HubActionState | null, formData: FormData): Promise<HubActionState> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_VIEW);

  const appointmentId = String(formData.get("appointmentId") ?? "").trim();
  const noteId = String(formData.get("noteId") ?? "").trim();
  if (!appointmentId || !noteId) return { error: (await getStaffT())("Missing comment.") };

  try {
    if (admin.permissions.has(PERMISSIONS.CLIENT_MANAGE)) {
      await prisma.visitNote.delete({ where: { id: noteId } });
    } else {
      await deleteVisitNote(noteId, admin.id);
    }
  } catch (err) {
    return { error: await errorText(err, "Failed to delete comment.") };
  }

  revalidateHub(appointmentId);
  return { success: true };
}

export async function toggleHubCommentPinAction(_prev: HubActionState | null, formData: FormData): Promise<HubActionState> {
  await requireAdmin(PERMISSIONS.VISITNOTE_WRITE);

  const appointmentId = String(formData.get("appointmentId") ?? "").trim();
  const noteId = String(formData.get("noteId") ?? "").trim();
  const pinned = formData.get("pinned") === "true";
  if (!appointmentId || !noteId) return { error: (await getStaffT())("Missing comment.") };

  try {
    await setNotePinned(noteId, pinned);
  } catch (err) {
    return { error: await errorText(err, "Failed to update comment.") };
  }

  revalidateHub(appointmentId);
  return { success: true };
}

// --- Documents --------------------------------------------------------------

export type DocumentActionResult = { ok: true } | { ok: false; error: string };

// Uploads one file and attaches it to this visit (and appointment). Guarded by
// BOOKING_MANAGE (writing to the visit). The file's real type/size are
// re-validated inside uploadVisitDocument from its bytes — the form's declared
// type is never trusted.
export async function uploadDocumentAction(formData: FormData): Promise<DocumentActionResult> {
  const admin = await requireAdmin(PERMISSIONS.BOOKING_MANAGE);

  const appointmentId = String(formData.get("appointmentId") ?? "").trim();
  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const clientProfileId = String(formData.get("clientProfileId") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "OTHER");
  const category = (DOCUMENT_CATEGORIES as readonly string[]).includes(categoryRaw) ? (categoryRaw as DocumentCategory) : "OTHER";
  const note = String(formData.get("note") ?? "").trim();
  const file = formData.get("file");

  if (!appointmentId || !bookingId || !clientProfileId) return { ok: false, error: (await getStaffT())("Missing appointment.") };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: (await getStaffT())("Choose a file to upload.") };
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, error: (await getStaffT())("File is too large (max 25MB).") };

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    await uploadVisitDocument(
      { clientProfileId, bookingId, appointmentId, category, note: note || undefined, fileName: file.name, uploadedById: admin.id },
      bytes,
    );
  } catch (err) {
    return { ok: false, error: await errorText(err, "Failed to upload the document.") };
  }

  revalidateHub(appointmentId);
  return { ok: true };
}

export async function deleteDocumentAction(_prev: HubActionState | null, formData: FormData): Promise<HubActionState> {
  await requireAdmin(PERMISSIONS.BOOKING_MANAGE);

  const appointmentId = String(formData.get("appointmentId") ?? "").trim();
  const documentId = String(formData.get("documentId") ?? "").trim();
  if (!appointmentId || !documentId) return { error: (await getStaffT())("Missing document.") };

  try {
    await deleteVisitDocument(documentId);
  } catch (err) {
    return { error: await errorText(err, "Failed to delete the document.") };
  }

  revalidateHub(appointmentId);
  return { success: true };
}
