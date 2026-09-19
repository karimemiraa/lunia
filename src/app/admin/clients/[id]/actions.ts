"use server";

// Server actions backing the client profile page (page.tsx) and its client
// components (VisitNoteForm, VisitNoteRow, TierEditor). Every action
// re-checks its own permission FIRST -- never trusts that the page that
// rendered the control already checked it -- and mutations revalidate this
// client's profile path so a following router.refresh() picks up fresh
// data. Mirrors admin/calendar/actions.ts's structure.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import { prisma } from "@/lib/db";
import { addVisitNote, deleteVisitNote, setNotePinned } from "@/modules/crm/visitNotes";
import { updateClientTier, updateCustomer, deleteCustomer } from "@/modules/crm/clients";
import { setLeadStage, assignOwner, setFollowUp, logActivity, LEAD_STAGES } from "@/modules/crm/leads";
import type { LeadStage } from "@prisma/client";
import { redirect } from "next/navigation";
import { upsertPreference } from "@/modules/comms/preferences";
import { adjustPoints } from "@/modules/crm/loyalty";
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

// Pins/unpins a comment so it surfaces at the top of the profile and as a
// header flag. Guarded by VISITNOTE_WRITE (same as adding a comment) — pinning
// is a curation action over the same content.
export async function toggleNotePinAction(_prev: ClientActionState | null, formData: FormData): Promise<ClientActionState> {
  await requireAdmin(PERMISSIONS.VISITNOTE_WRITE);

  const noteId = String(formData.get("noteId") ?? "").trim();
  const clientProfileId = String(formData.get("clientProfileId") ?? "").trim();
  const pinned = formData.get("pinned") === "true";
  if (!noteId || !clientProfileId) {
    return { error: "Missing comment." };
  }

  try {
    await setNotePinned(noteId, pinned);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update comment." };
  }

  revalidateClient(clientProfileId);
  return { success: true };
}

// Edits a customer's name, contact, and source. Guarded by CLIENT_MANAGE and
// audited (contact details are sensitive).
export async function updateCustomerAction(_prev: ClientActionState | null, formData: FormData): Promise<ClientActionState> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);

  const clientProfileId = String(formData.get("clientProfileId") ?? "").trim();
  if (!clientProfileId) return { error: "Missing customer." };

  try {
    await updateCustomer(clientProfileId, {
      fullName: String(formData.get("fullName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      source: String(formData.get("source") ?? ""),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update customer." };
  }

  await recordAudit({
    actorUserId: admin.id,
    action: "CLIENT_UPDATE",
    entityType: "ClientProfile",
    entityId: clientProfileId,
    summary: `Updated customer details for "${clientProfileId}"`,
  });
  revalidateClient(clientProfileId);
  return { success: true };
}

// Permanently deletes a customer (and their bookings/history). Guarded by
// CLIENT_MANAGE, audited, then redirects to the roster.
export async function deleteCustomerAction(_prev: ClientActionState | null, formData: FormData): Promise<ClientActionState> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);

  const clientProfileId = String(formData.get("clientProfileId") ?? "").trim();
  if (!clientProfileId) return { error: "Missing customer." };

  try {
    await deleteCustomer(clientProfileId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete customer." };
  }

  await recordAudit({
    actorUserId: admin.id,
    action: "CLIENT_DELETE",
    entityType: "ClientProfile",
    entityId: clientProfileId,
    summary: `Deleted customer "${clientProfileId}"`,
  });
  redirect("/admin/clients");
}

// --- Sales pipeline (CRM) ---------------------------------------------------

// One save for stage + owner + follow-up. Stage/owner changes are logged as
// activities (setLeadStage/assignOwner); the follow-up date is set silently.
export async function updateLeadAction(_prev: ClientActionState | null, formData: FormData): Promise<ClientActionState> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  const clientProfileId = String(formData.get("clientProfileId") ?? "").trim();
  if (!clientProfileId) return { error: "Missing customer." };

  const stage = String(formData.get("stage") ?? "").trim();
  const ownerId = String(formData.get("ownerId") ?? "").trim() || null;
  const raw = String(formData.get("nextFollowUpAt") ?? "").trim();
  const date = raw ? new Date(raw) : null;
  if (raw && Number.isNaN(date!.getTime())) return { error: "Invalid date." };

  try {
    const current = await prisma.clientProfile.findUnique({ where: { id: clientProfileId }, select: { stage: true, ownerId: true } });
    if (!current) return { error: "Customer not found." };
    if ((LEAD_STAGES as string[]).includes(stage) && stage !== current.stage) {
      await setLeadStage(clientProfileId, stage as LeadStage, admin.id);
    }
    if (ownerId !== current.ownerId) {
      await assignOwner(clientProfileId, ownerId, admin.id);
    }
    await setFollowUp(clientProfileId, date);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update pipeline." };
  }
  revalidateClient(clientProfileId);
  return { success: true };
}

export async function logLeadActivityAction(_prev: ClientActionState | null, formData: FormData): Promise<ClientActionState> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);
  const clientProfileId = String(formData.get("clientProfileId") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim();
  if (!clientProfileId || !kind) return { error: "Pick an activity type." };
  try {
    await logActivity({
      clientProfileId,
      authorUserId: admin.id,
      kind,
      outcome: String(formData.get("outcome") ?? "") || null,
      body: String(formData.get("body") ?? "") || null,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to log activity." };
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

const adjustLoyaltyPointsSchema = z.object({
  clientProfileId: z.string().min(1, "Missing client."),
  deltaPoints: z.coerce
    .number()
    .int("Points must be a whole number.")
    .refine((n) => n !== 0, { message: "Points must be non-zero." }),
  reason: z.string().trim().min(1, "A reason is required."),
});

// Applies a manual loyalty-points adjustment (positive credit or negative
// correction) for a client -- e.g. a goodwill gesture or fixing a mistaken
// earn. Guarded by CLIENT_MANAGE (same as updateTierAction/
// updateNotificationPreferenceAction above) and audited, since it directly
// changes a client's spendable points balance. adjustPoints itself refuses
// (throws) an adjustment that would push the balance negative.
export async function adjustLoyaltyPointsAction(
  _prev: ClientActionState | null,
  formData: FormData,
): Promise<ClientActionState> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);

  const parsed = adjustLoyaltyPointsSchema.safeParse({
    clientProfileId: formData.get("clientProfileId"),
    deltaPoints: formData.get("deltaPoints"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { clientProfileId, deltaPoints, reason } = parsed.data;

  try {
    await adjustPoints(clientProfileId, deltaPoints, reason);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to adjust points." };
  }

  await recordAudit({
    actorUserId: admin.id,
    action: "LOYALTY_POINTS_ADJUST",
    entityType: "LoyaltyAccount",
    entityId: clientProfileId,
    summary: `Adjusted loyalty points for client "${clientProfileId}" by ${deltaPoints > 0 ? "+" : ""}${deltaPoints} (${reason})`,
  });

  revalidateClient(clientProfileId);
  return { success: true };
}

// --- Clinical profile, tags & consent ---------------------------------------

function csvToList(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 40);
}

// Saves the skin/clinical profile, CRM tags, and PDPL consent for a client.
// Consent timestamps are set when the box is ticked and cleared when unticked,
// so the stored time is when consent was (last) granted.
export async function saveClinicalAction(_prev: ClientActionState | null, formData: FormData): Promise<ClientActionState> {
  const admin = await requireAdmin(PERMISSIONS.CLIENT_MANAGE);

  const clientProfileId = String(formData.get("clientProfileId") ?? "").trim();
  if (!clientProfileId) return { error: "Missing client." };

  const skinTypeRaw = String(formData.get("skinType") ?? "").trim();
  const allergiesRaw = String(formData.get("allergies") ?? "").trim();
  const clinicalNotesRaw = String(formData.get("clinicalNotes") ?? "").trim();
  const consentTreatment = formData.get("consentTreatment") === "on";
  const consentData = formData.get("consentData") === "on";

  const existing = await prisma.clientProfile.findUnique({
    where: { id: clientProfileId },
    select: { consentTreatmentAt: true, consentDataAt: true },
  });
  if (!existing) return { error: "Client not found." };

  try {
    await prisma.clientProfile.update({
      where: { id: clientProfileId },
      data: {
        tags: csvToList(formData.get("tags")),
        skinType: skinTypeRaw || null,
        skinConcerns: csvToList(formData.get("skinConcerns")),
        allergies: allergiesRaw || null,
        clinicalNotes: clinicalNotesRaw || null,
        // Preserve the original grant time if still consented; set now on a new
        // grant; clear when consent is withdrawn.
        consentTreatmentAt: consentTreatment ? (existing.consentTreatmentAt ?? new Date()) : null,
        consentDataAt: consentData ? (existing.consentDataAt ?? new Date()) : null,
      },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save clinical profile." };
  }

  await recordAudit({
    actorUserId: admin.id,
    action: "CLIENT_CLINICAL_UPDATE",
    entityType: "ClientProfile",
    entityId: clientProfileId,
    summary: `Updated clinical profile, tags & consent for client "${clientProfileId}"`,
  });

  revalidateClient(clientProfileId);
  return { success: true };
}
