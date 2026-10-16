// Specialist discounts above the cap, waiting for a discount:approve decision.

import { PERMISSIONS } from "@/modules/iam/permissions";
import { pendingDiscounts } from "@/modules/booking/discounts";
import type { NotificationSource } from "./index";

export const discountSource: NotificationSource = async (permissions) => {
  if (!permissions.has(PERMISSIONS.DISCOUNT_APPROVE)) return { count: 0, items: [] };
  const { count, rows } = await pendingDiscounts(5);
  return {
    count,
    items: rows.map((r) => ({
      id: `discount-${r.id}`,
      type: "discount" as const,
      title: `Discount to approve — ${r.appointment.booking.client.fullName}`,
      subtitle: `${r.pctBp / 100}% · ${r.appointment.staff.staffProfile?.fullName ?? ""} · ${r.reason}`,
      href: `/admin/calendar/${r.appointment.id}`,
      at: r.createdAt,
    })),
  };
};
