// Notification source: open staff edit requests (filed from the Ask Lunia
// assistant). Visible to whoever can act on them (settings managers).

import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/modules/iam/permissions";
import type { NotificationSource } from "./index";

export const editRequestSource: NotificationSource = async (permissions) => {
  if (!permissions.has(PERMISSIONS.SETTINGS_MANAGE)) return { count: 0, items: [] };
  const where = { status: { in: ["OPEN"] } };
  const [count, rows] = await Promise.all([
    prisma.editRequest.count({ where }),
    prisma.editRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  return {
    count,
    items: rows.map((r) => ({
      id: `req-${r.id}`,
      type: "request" as const,
      title: `Edit request — ${r.title}`,
      subtitle: [r.createdByName, r.priority === "HIGH" ? "high priority" : null, r.pagePath].filter(Boolean).join(" · ") || null,
      href: "/admin/requests",
      at: r.createdAt,
    })),
  };
};
