// Derived notification feed for the admin bell. Rather than a per-user
// notifications table with triggers on every mutation, this reads the "still
// needs attention" state directly: unhandled inquiries, unread WhatsApp
// threads, new inbound leads, and today's new bookings. Items clear naturally
// as staff handle them (an inquiry marked handled, a WhatsApp thread read).

import { prisma } from "@/lib/db";
import { openStageKeys } from "@/modules/crm/pipeline";
import type { PermissionKey } from "@/modules/iam/permissions";
import { SOURCES } from "./sources";

export {
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_HREF,
  type NotificationType,
  type NotificationItem,
  type NotificationFeed,
} from "./types";
import type { NotificationType, NotificationItem, NotificationFeed } from "./types";

const NEW_LEAD_WINDOW_DAYS = 7;

export interface NotificationFeedOptions {
  /** Newest items to return (default 12; the "View all" page asks for more). */
  limit?: number;
}

export async function getNotificationFeed(
  permissions: Set<PermissionKey> = new Set(),
  { limit = 12 }: NotificationFeedOptions = {},
): Promise<NotificationFeed> {
  const since = new Date(Date.now() - NEW_LEAD_WINDOW_DAYS * 86_400_000);
  const perSource = Math.min(Math.max(5, limit), 50);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // "New leads" = recently created and still in an open stage (not won/lost),
  // so it survives renaming/adding stages in Superadmin.
  const openKeys = await openStageKeys();
  const newLeadWhere = { stage: { in: openKeys }, createdAt: { gte: since } };

  const [
    inquiryCount,
    inquiries,
    whatsappCount,
    conversations,
    leadCount,
    leads,
    bookingCount,
    bookings,
  ] = await Promise.all([
    prisma.contactInquiry.count({ where: { handled: false } }),
    prisma.contactInquiry.findMany({ where: { handled: false }, orderBy: { createdAt: "desc" }, take: perSource }),
    prisma.whatsappConversation.count({ where: { unread: true } }),
    prisma.whatsappConversation.findMany({ where: { unread: true }, orderBy: { lastMessageAt: "desc" }, take: perSource, include: { client: { select: { fullName: true } } } }),
    prisma.clientProfile.count({ where: newLeadWhere }),
    prisma.clientProfile.findMany({ where: newLeadWhere, orderBy: { createdAt: "desc" }, take: perSource, include: { user: { select: { phone: true, email: true } } } }),
    prisma.booking.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.booking.findMany({ where: { createdAt: { gte: startOfToday } }, orderBy: { createdAt: "desc" }, take: perSource, include: { client: { select: { fullName: true } } } }),
  ]);

  const items: NotificationItem[] = [
    ...inquiries.map((i) => ({
      id: `inq-${i.id}`,
      type: "inquiry" as const,
      title: `New inquiry — ${i.name}`,
      subtitle: i.message.slice(0, 80),
      href: `/admin/inquiries/${i.id}`,
      at: i.createdAt,
    })),
    ...conversations.map((c) => ({
      id: `wa-${c.id}`,
      type: "whatsapp" as const,
      title: `WhatsApp — ${c.client?.fullName || c.phone}`,
      subtitle: c.lastMessagePreview,
      href: `/admin/whatsapp?c=${c.id}`,
      at: c.lastMessageAt,
    })),
    ...leads.map((l) => ({
      id: `lead-${l.id}`,
      type: "lead" as const,
      title: `New lead — ${l.fullName}`,
      subtitle: l.user.phone ?? l.user.email,
      href: `/admin/clients/${l.id}`,
      at: l.createdAt,
    })),
    ...bookings.map((b) => ({
      id: `bk-${b.id}`,
      type: "booking" as const,
      title: `New booking — ${b.client?.fullName ?? "Customer"}`,
      subtitle: null,
      href: `/admin/clients/${b.clientProfileId}`,
      at: b.createdAt,
    })),
  ];
  const counts: Partial<Record<NotificationType, number>> = {
    inquiry: inquiryCount,
    whatsapp: whatsappCount,
    lead: leadCount,
    booking: bookingCount,
  };
  let total = inquiryCount + whatsappCount + leadCount + bookingCount;

  // Module-contributed sources; one failing source never breaks the bell.
  const extra = await Promise.allSettled(SOURCES.map((source) => source(permissions)));
  for (const result of extra) {
    if (result.status !== "fulfilled") continue;
    total += result.value.count;
    // Sources are homogeneous, so the source's true count belongs to the
    // type of its items (items are capped, counts are not).
    const type = result.value.items[0]?.type;
    if (type) counts[type] = (counts[type] ?? 0) + result.value.count;
    for (const item of result.value.items) items.push(item);
  }

  items.sort((a, b) => b.at.getTime() - a.at.getTime());

  return { total, counts, items: items.slice(0, limit) };
}
