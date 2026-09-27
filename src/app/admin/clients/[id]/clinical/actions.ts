"use server";

// Server actions for the admin patient file (clinical:manage). Each action
// re-checks the permission itself, validates via the clinical modules' zod
// schemas, audits the mutation and revalidates the customer page.

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import { prisma } from "@/lib/db";
import { submitIntake } from "@/modules/clinical/intake";
import { consentStatusForClient, signConsent } from "@/modules/clinical/consents";
import { createTreatmentRecord, updateTreatmentRecord, type TreatmentInput } from "@/modules/clinical/treatments";
import { deleteClinicalPhoto, getClinicalPhoto, updateClinicalPhotoMeta, uploadClinicalPhoto, type PhotoKind } from "@/modules/clinical/photos";

export type ActionResult = { ok: true } | { ok: false; error: string };

function message(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "issues" in err) return "Please check the highlighted values and try again.";
  return err instanceof Error && err.message ? err.message : fallback;
}

function revalidateClient(clientProfileId: string) {
  revalidatePath(`/admin/clients/${clientProfileId}`);
}

async function assertClient(clientProfileId: string) {
  const exists = await prisma.clientProfile.findUnique({ where: { id: clientProfileId }, select: { id: true, fullName: true } });
  if (!exists) throw new Error("Customer not found");
  return exists;
}

// --- Intake --------------------------------------------------------------------

export async function saveIntakeAction(clientProfileId: string, answers: unknown): Promise<ActionResult> {
  const admin = await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  try {
    const client = await assertClient(clientProfileId);
    const row = await submitIntake({ clientProfileId, answers, submittedBy: "STAFF", staffUserId: admin.id });
    await recordAudit({
      actorUserId: admin.id,
      action: "clinical.intake.submit",
      entityType: "MedicalIntake",
      entityId: row.id,
      summary: `Updated the health questionnaire for ${client.fullName || clientProfileId}`,
    });
  } catch (err) {
    return { ok: false, error: message(err, "Could not save the questionnaire.") };
  }
  revalidateClient(clientProfileId);
  return { ok: true };
}

// --- Consent signing at the desk ------------------------------------------------

export async function signAtDeskAction(
  clientProfileId: string,
  formId: string,
  locale: string,
  input: { signerName: string; signatureData: string },
): Promise<{ ok: true; signatureId: string } | { ok: false; error: string }> {
  const admin = await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  try {
    const client = await assertClient(clientProfileId);
    const status = (await consentStatusForClient(clientProfileId)).find((r) => r.formId === formId);
    const h = await headers();
    const ip = (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "").slice(0, 64) || null;
    const signature = await signConsent({
      clientProfileId,
      consentFormId: formId,
      signerName: input?.signerName,
      signatureData: input?.signatureData,
      locale: locale === "en" ? "en" : "ar",
      bookingId: status?.bookingIds[0] ?? null,
      witnessUserId: admin.id,
      ip,
    });
    await recordAudit({
      actorUserId: admin.id,
      action: "clinical.consent.sign_at_desk",
      entityType: "ConsentSignature",
      entityId: signature.id,
      summary: `Witnessed a consent signature (v${signature.formVersion}) for ${client.fullName || clientProfileId}`,
    });
    revalidateClient(clientProfileId);
    return { ok: true, signatureId: signature.id };
  } catch (err) {
    return { ok: false, error: message(err, "Could not record the signature.") };
  }
}

// --- Treatment records --------------------------------------------------------

export async function saveTreatmentAction(
  clientProfileId: string,
  recordId: string | null,
  input: Omit<TreatmentInput, "clientProfileId">,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  try {
    const client = await assertClient(clientProfileId);
    const data = { ...input, clientProfileId };
    const record = recordId ? await updateTreatmentRecord(recordId, data) : await createTreatmentRecord(data);
    await recordAudit({
      actorUserId: admin.id,
      action: recordId ? "clinical.treatment.update" : "clinical.treatment.create",
      entityType: "TreatmentRecord",
      entityId: record.id,
      summary: `${recordId ? "Updated" : "Added"} a treatment record for ${client.fullName || clientProfileId}`,
    });
    revalidateClient(clientProfileId);
    return { ok: true, id: record.id };
  } catch (err) {
    return { ok: false, error: message(err, "Could not save the treatment record.") };
  }
}

// --- Photos ---------------------------------------------------------------------

// One file per call: the upload UI sends files sequentially so each request
// stays well under the server-action body limit (next.config.ts).
export async function uploadPhotoAction(formData: FormData): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const admin = await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  const clientProfileId = String(formData.get("clientProfileId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo to upload." };
  try {
    const client = await assertClient(clientProfileId);
    const photo = await uploadClinicalPhoto(
      {
        clientProfileId,
        kind: String(formData.get("kind") ?? "OTHER") as PhotoKind,
        area: String(formData.get("area") ?? ""),
        device: String(formData.get("device") ?? ""),
        note: String(formData.get("note") ?? ""),
        treatmentRecordId: String(formData.get("treatmentRecordId") ?? ""),
        takenAt: formData.get("takenAt") ? String(formData.get("takenAt")) : null,
        uploadedById: admin.id,
      },
      Buffer.from(await file.arrayBuffer()),
    );
    await recordAudit({
      actorUserId: admin.id,
      action: "clinical.photo.upload",
      entityType: "ClinicalPhoto",
      entityId: photo.id,
      summary: `Uploaded a ${photo.kind.toLowerCase()} clinical photo for ${client.fullName || clientProfileId}`,
    });
    revalidateClient(clientProfileId);
    return { ok: true, id: photo.id };
  } catch (err) {
    return { ok: false, error: message(err, "Could not upload the photo.") };
  }
}

export async function updatePhotoAction(
  photoId: string,
  input: { kind?: PhotoKind; area?: string | null; note?: string | null; treatmentRecordId?: string | null },
): Promise<ActionResult> {
  await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  try {
    const photo = await updateClinicalPhotoMeta(photoId, input);
    revalidateClient(photo.clientProfileId);
    revalidatePath(`/admin/clients/${photo.clientProfileId}/clinical/photos`);
  } catch (err) {
    return { ok: false, error: message(err, "Could not update the photo.") };
  }
  return { ok: true };
}

export async function deletePhotoAction(photoId: string): Promise<ActionResult> {
  const admin = await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  const photo = await getClinicalPhoto(photoId);
  if (!photo) return { ok: false, error: "Photo not found." };
  try {
    await deleteClinicalPhoto(photoId);
    await recordAudit({
      actorUserId: admin.id,
      action: "clinical.photo.delete",
      entityType: "ClinicalPhoto",
      entityId: photoId,
      summary: `Deleted a clinical photo (${photo.kind.toLowerCase()}) from customer ${photo.clientProfileId}`,
    });
  } catch (err) {
    return { ok: false, error: message(err, "Could not delete the photo.") };
  }
  revalidateClient(photo.clientProfileId);
  revalidatePath(`/admin/clients/${photo.clientProfileId}/clinical/photos`);
  return { ok: true };
}
