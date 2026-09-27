// Notification source: call-backs that are due now (requested times that have
// arrived, and "no answer" retries whose next attempt is due). Visible to
// anyone who can view customers.

import { dueCallbacks } from "@/modules/assistant/callbacks";
import { PERMISSIONS } from "@/modules/iam/permissions";
import type { NotificationSource } from "./index";

export const callbackSource: NotificationSource = async (permissions) => {
  if (!permissions.has(PERMISSIONS.CLIENT_VIEW)) return { count: 0, items: [] };
  const { count, items } = await dueCallbacks(new Date(), 5);
  return {
    count,
    items: items.map((c) => ({
      id: `cb-${c.id}`,
      type: "callback" as const,
      title: `Call back — ${c.name}`,
      subtitle: [c.phone, c.attempts > 0 ? `attempt ${c.attempts + 1}` : null, c.topic].filter(Boolean).join(" · ") || null,
      href: "/admin/callbacks",
      at: c.dueAt ?? c.createdAt,
    })),
  };
};
