"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { upsertCampaignSpend } from "@/modules/crm/campaigns";

export interface CampaignSpendActionState {
  error?: string;
  success?: boolean;
}

const PERIOD_MONTH_PATTERN = /^\d{4}-\d{2}$/;

// amountSar is entered by the admin in whole SAR (with optional cents); the
// stored/canonical unit is minor (halalas, 1/100 SAR) -- same convention as
// EditServiceForm's priceSar -> priceMinor conversion.
export async function upsertCampaignSpendAction(
  _prev: CampaignSpendActionState | null,
  formData: FormData,
): Promise<CampaignSpendActionState> {
  await requireAdmin(PERMISSIONS.MARKETING_MANAGE);

  const channel = String(formData.get("channel") ?? "").trim();
  const periodMonth = String(formData.get("periodMonth") ?? "").trim();
  const amountSarRaw = String(formData.get("amountSar") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  if (!channel) {
    return { error: "Channel is required." };
  }
  if (!PERIOD_MONTH_PATTERN.test(periodMonth)) {
    return { error: "Period month must be in YYYY-MM format." };
  }

  const amountSar = Number(amountSarRaw);
  if (!Number.isFinite(amountSar) || amountSar < 0) {
    return { error: "Amount must be a non-negative number." };
  }

  try {
    await upsertCampaignSpend({
      channel,
      periodMonth,
      amountMinor: Math.round(amountSar * 100),
      note: note || undefined,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save campaign spend." };
  }

  revalidatePath("/admin/marketing/campaigns");
  revalidatePath("/admin/marketing");
  return { success: true };
}
