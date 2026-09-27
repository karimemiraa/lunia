// Issued invoices still unpaid (or part-paid) more than 3 days after issue.
// Clears itself once the invoice is paid or credited in full.

import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";
import { listOverdueUnpaid } from "@/modules/billing/invoices";
import { formatSarMinor } from "@/modules/billing/money";
import type { NotificationSource } from "./index";

const OVERDUE_DAYS = 3;

export const unpaidInvoicesSource: NotificationSource = async (permissions: Set<PermissionKey>) => {
  if (!permissions.has(PERMISSIONS.BILLING_MANAGE)) return { count: 0, items: [] };
  const { count, items } = await listOverdueUnpaid(OVERDUE_DAYS, 5);
  return {
    count,
    items: items.map((inv) => ({
      id: `inv-${inv.id}`,
      type: "invoice" as const,
      title: `Unpaid invoice ${inv.number} — ${inv.customerName}`,
      subtitle: `${formatSarMinor(inv.totalMinor - inv.paidMinor)} outstanding`,
      href: `/admin/billing/${inv.id}`,
      at: inv.issuedAt ?? inv.createdAt,
    })),
  };
};
