"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { upsertTemplate } from "@/modules/comms/templates";

export interface TemplateActionState {
  error?: string;
  success?: boolean;
}

// Re-checks SETTINGS_MANAGE on every call (never trusts the page-load guard
// alone). isActive is always read as an explicit boolean from the checkbox's
// presence/absence in formData -- never left undefined -- so a save can
// never silently reactivate a template the admin had deliberately turned
// off: upsertTemplate() defaults isActive to true only when the caller omits
// the field entirely, which this action never does.
export async function updateTemplateAction(_prev: TemplateActionState | null, formData: FormData): Promise<TemplateActionState> {
  await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);

  const kind = String(formData.get("kind") ?? "").trim();
  const locale = String(formData.get("locale") ?? "").trim();
  const channel = String(formData.get("channel") ?? "").trim();
  const bodyTemplate = String(formData.get("bodyTemplate") ?? "");
  const providerTemplateNameRaw = String(formData.get("providerTemplateName") ?? "").trim();
  const isActive = formData.get("isActive") === "on";

  if (!kind || !locale || !channel) {
    return { error: "Missing template identity." };
  }

  try {
    await upsertTemplate({
      kind,
      locale,
      channel,
      bodyTemplate,
      providerTemplateName: providerTemplateNameRaw.length > 0 ? providerTemplateNameRaw : undefined,
      isActive,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save template." };
  }

  revalidatePath("/admin/comms/templates");
  return { success: true };
}
