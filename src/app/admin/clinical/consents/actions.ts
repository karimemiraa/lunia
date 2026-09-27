"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import { createConsentForm, updateConsentForm, type ConsentFormInput } from "@/modules/clinical/consents";

export type ConsentFormActionResult = { ok: true; id: string; version: number } | { ok: false; error: string };

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "issues" in err) {
    const issue = (err as { issues: { message?: string; path?: PropertyKey[] }[] }).issues[0];
    return issue ? `${issue.path?.join(".") || "Form"}: ${issue.message}` : "Please check the form.";
  }
  if (err && typeof err === "object" && (err as { code?: string }).code === "P2002") return "That key is already used by another form.";
  return err instanceof Error ? err.message : "Could not save the consent form.";
}

// id null = create. Editing the wording bumps the version (see
// updateConsentForm); existing signatures keep the version they signed.
export async function saveConsentFormAction(id: string | null, input: ConsentFormInput): Promise<ConsentFormActionResult> {
  const admin = await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  try {
    const form = id ? await updateConsentForm(id, input) : await createConsentForm(input);
    await recordAudit({
      actorUserId: admin.id,
      action: id ? "clinical.consent_form.update" : "clinical.consent_form.create",
      entityType: "ConsentForm",
      entityId: form.id,
      summary: `${id ? "Saved" : "Created"} consent form "${form.titleEn}" (v${form.version}${form.isActive ? "" : ", inactive"})`,
    });
    revalidatePath("/admin/clinical/consents");
    return { ok: true, id: form.id, version: form.version };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
