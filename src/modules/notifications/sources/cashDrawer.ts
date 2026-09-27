// Flags a front-desk cash drawer left open past STALE_SESSION_HOURS: someone
// forgot to count and close it at the end of the day.

import { PERMISSIONS } from "@/modules/iam/permissions";
import { staleOpenCashSession, STALE_SESSION_HOURS } from "@/modules/accounting/cash";
import { formatMinor } from "@/modules/accounting/periods";
import type { NotificationSource } from "./index";

export const cashDrawerSource: NotificationSource = async (permissions) => {
  if (!permissions.has(PERMISSIONS.ACCOUNTING_MANAGE) && !permissions.has(PERMISSIONS.BILLING_MANAGE)) {
    return { count: 0, items: [] };
  }
  const session = await staleOpenCashSession();
  if (!session) return { count: 0, items: [] };
  return {
    count: 1,
    items: [
      {
        id: `cash-${session.id}`,
        type: "invoice",
        title: "Cash drawer still open",
        subtitle: `Open for over ${STALE_SESSION_HOURS} hours, float ${formatMinor(session.openingFloatMinor)}`,
        href: "/admin/accounting/cash",
        at: session.openedAt,
      },
    ],
  };
};
