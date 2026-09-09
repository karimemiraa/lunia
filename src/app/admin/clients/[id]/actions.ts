"use server";

// Server actions backing the client profile page (page.tsx) and its client
// components (VisitNoteForm, VisitNoteRow, TierEditor). Every action
// re-checks its own permission FIRST -- never trusts that the page that
// rendered the control already checked it -- and mutations revalidate this
// client's profile path so a following router.refresh() picks up fresh
// data. Mirrors admin/calendar/actions.ts's structure.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import { prisma } from "@/lib/db";
import { addVisitNote, deleteVisitNote } from "@/modules/crm/visitNotes";
import { updateClientTier } from "@/modules/crm/clients";
import { upsertPreference } from "@/modules/comms/preferences";
import type { CommsChannelPref } from "@prisma/client";

export interface ClientActionState {
  error?: string;
  success?: boolean;
}

function revalidateClient(clientProfileId: string): void {
  revalidatePath(`/admin/clients/${clientProfileId}`);
}

export async function addNoteAction(_prev: ClientActionState | null, formData: FormData): Promise<ClientActionState> {
  const admin = await requireAdmin(PERMISSIONS.VISITNOTE_WRITE);

  const clientProfileId = String(formData.get("clientProfileId") ?? "").trim();
  const bookingId = String(formData.get("bookingId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!clientProfileId) {
    return { error: "Missing client." };
  }
  if (!body) {
    return { error: "Note body cannot be empty." };
  }

  try {
    await addVisitNote({
      clientProfileId,
      bookingId: bookingId || undefined,
      authorUserId: admin.id,
      body,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add visit note." };
  }

  revalidateClient(clientProfileId);
  return { success: true };
}

// Deletion is allowed for the note's own author, OR for any staff holding
// CLIENT_MANAGE (who can moderate any client's notes). The author path goes
// through deleteVisitNote's own authorUserId check (byUserId); the
// CLIENT_MANAGE path deletes directly, per the "admin PAGE layer" carve-out
// documented on visitNotes.ts's deleteVisitNote.
export async function deleteNoteAction(_prev: ClientActionState | null, formData: FormData): Promise<ClientActionState> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_VIEW);

  const noteId = String(formData.get("noteId") ?? "").trim();
  const clientProfileId = String(formData.get("clientProfileId") ?? "").trim();
  if (!noteId || !clientProfileId) {
    return { error: "Missing note." };
  }

  try {
    if (admin.permissions.has(PERMISSIONS.CLIENT_MANAGE)) {
      await prisma.visitNote.delete({ where: { id: noteId } });
    } else {
      await deleteVisitNote(noteId, admin.id);
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete visit note." };
  }

  revalidateClient(clientProfileId);
  return { success: true };
}

export async function updateTierAction(_prev: ClientActionState | null, formData: FormData): Promise<ClientActionState> {
  await requireAdmin(PERMISSIONS.CLIENT_MANAGE);

  const clientProfileId = String(formData.get("clientProfileId") ?? "").trim();
  if (!clientProfileId) {
    return { error: "Missing client." };
  }
  const tierId = String(formData.get("tierId") ?? "").trim();

  try {
    await updateClientTier(clientProfileId, tierId || null);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update tier." };
  }

  revalidateClient(clientProfileId);
  return { success: true };
}

const NOTIFICATION_CHANNEL_VALUES = ["AUTO", "WHATSAPP", "SMS", "EMAIL"] as const;

// Updates a client's NotificationPreference (channel + opt-ins) on their
// behalf -- e.g. when a client asks staff over the phone to change how they
// get reminded. Guarded by CLIENT_MANAGE (like updateTierAction above) and
// audited since it changes how/whether the client is contacted.
export async function updateNotificationPreferenceAction(
  _prev: ClientActionState | null,
  formData: FormData,
): Promise<ClientActionState> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);

  const clientProfileId = String(formData.get("clientProfileId") ?? "").trim();
  if (!clientProfileId) {
    return { error: "Missing client." };
  }

  const rawChannel = String(formData.get("channel") ?? "");
  const channel = (NOTIFICATION_CHANNEL_VALUES as readonly string[]).includes(rawChannel)
    ? (rawChannel as CommsChannelPref)
    : "AUTO";
  const remindersOptIn = formData.get("remindersOptIn") === "on";
  const postVisitOptIn = formData.get("postVisitOptIn") === "on";
  const marketingOptIn = formData.get("marketingOptIn") === "on";

  try {
    await upsertPreference(clientProfileId, { channel, remindersOptIn, postVisitOptIn, marketingOptIn });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update notification preferences." };
  }

  await recordAudit({
    actorUserId: admin.id,
    action: "CLIENT_NOTIFICATION_PREFERENCE_UPDATE",
    entityType: "NotificationPreference",
    entityId: clientProfileId,
    summary: `Updated notification preferences for client "${clientProfileId}"`,
  });

  revalidateClient(clientProfileId);
  return { success: true };
}
