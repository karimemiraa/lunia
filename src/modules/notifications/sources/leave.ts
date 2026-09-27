// Pending leave requests waiting for an hr:manage decision.

import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/modules/iam/permissions";
import type { NotificationSource } from "./index";

export const leaveSource: NotificationSource = async (permissions) => {
  if (!permissions.has(PERMISSIONS.HR_MANAGE)) return { count: 0, items: [] };
  const where = { status: "PENDING" };
  const [count, rows] = await Promise.all([
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { email: true, staffProfile: { select: { fullName: true } } } } },
    }),
  ]);
  return {
    count,
    items: rows.map((r) => ({
      id: `leave-${r.id}`,
      type: "leave" as const,
      title: `Leave request — ${r.user.staffProfile?.fullName || r.user.email || "Staff"}`,
      subtitle: `${r.type.toLowerCase()} · ${r.startDateISO} to ${r.endDateISO} (${r.days} day${r.days === 1 ? "" : "s"})`,
      href: "/admin/hr/leave",
      at: r.createdAt,
    })),
  };
};
