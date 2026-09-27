"use server";

// Cash drawer actions. Re-check the drawer permission on every call and
// audit opens/closes (the close records the variance).

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCashDrawer } from "../_components/access";
import { recordAudit } from "@/modules/iam/audit";
import { CashSessionError, closeCashSession, openCashSession } from "@/modules/accounting/cash";
import { formatMinor, parseSarToMinor } from "@/modules/accounting/periods";

export interface CashFormState {
  error?: string;
  message?: string;
}

const str = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
};

export async function openCashSessionAction(_prev: CashFormState | null, formData: FormData): Promise<CashFormState> {
  const user = await requireCashDrawer();
  const float = parseSarToMinor(str(formData, "float") || "0");
  if (float === null) return { error: "Enter the opening float in SAR, e.g. 500." };
  try {
    const session = await openCashSession({ openedById: user.id, openingFloatMinor: float, note: str(formData, "note") });
    await recordAudit({
      actorUserId: user.id,
      action: "cash.open",
      entityType: "CashSession",
      entityId: session.id,
      summary: `Opened the cash drawer with a ${formatMinor(float)} float`,
    });
  } catch (err) {
    if (err instanceof CashSessionError) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin/accounting/cash");
  redirect("/admin/accounting/cash");
}

export async function closeCashSessionAction(_prev: CashFormState | null, formData: FormData): Promise<CashFormState> {
  const user = await requireCashDrawer();
  const counted = parseSarToMinor(str(formData, "counted"));
  if (counted === null) return { error: "Enter the counted cash in SAR, e.g. 1840.50." };
  let closedId: string;
  try {
    const closed = await closeCashSession({
      sessionId: str(formData, "sessionId"),
      closedById: user.id,
      countedCashMinor: counted,
      note: str(formData, "note"),
    });
    closedId = closed.id;
    await recordAudit({
      actorUserId: user.id,
      action: "cash.close",
      entityType: "CashSession",
      entityId: closed.id,
      summary: `Closed the cash drawer: counted ${formatMinor(counted)}, expected ${formatMinor(closed.expectedCashMinor ?? 0)}, variance ${formatMinor(closed.varianceMinor)}`,
    });
  } catch (err) {
    if (err instanceof CashSessionError) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin/accounting/cash");
  // The close form unmounts once no session is open, so the result is shown
  // by the page itself from ?closed=.
  redirect(`/admin/accounting/cash?closed=${closedId}`);
}
