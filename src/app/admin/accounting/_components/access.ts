import { redirect } from "next/navigation";
import { requireAdmin, type AdminUser } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";

/** Accounting pages, exports and actions. */
export function requireAccounting(): Promise<AdminUser> {
  return requireAdmin(PERMISSIONS.ACCOUNTING_MANAGE);
}

/**
 * The cash drawer is run by the front desk (billing:manage) as well as by
 * accounting, so either permission may open, view and close it.
 */
export async function requireCashDrawer(): Promise<AdminUser> {
  const user = await requireAdmin();
  if (!user.permissions.has(PERMISSIONS.ACCOUNTING_MANAGE) && !user.permissions.has(PERMISSIONS.BILLING_MANAGE)) {
    redirect("/admin");
  }
  return user;
}
