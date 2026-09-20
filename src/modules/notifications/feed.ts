// Derived notification feed for the admin bell. Rather than a per-user
// notifications table with triggers on every mutation, this reads the "still
// needs attention" state directly: unhandled inquiries, unread WhatsApp
// threads, new inbound leads, and today's new bookings. Items clear naturally
// as staff handle them (an inquiry marked handled, a WhatsApp thread read).

import { prisma } from "@/lib/db";
import { openStageKeys } from "@/modules/crm/pipeline";

export type NotificationType = "inquiry" | "whatsapp" | "lead" | "booking";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  subtitle: string | null;
  href: string;
  at: Date;
}

export interface NotificationFeed {
  total: number;
  counts: Record<NotificationType, number>;
  items: NotificationItem[];
}

const NEW_LEAD_WINDOW_DAYS = 7;

export async function getNotificationFeed(): Promise<NotificationFeed> {
  const since = new Date(Date.now() - NEW_LEAD_WINDOW_DAYS * 86_400_000);
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
    prisma.contactInquiry.findMany({ where: { handled: false }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.whatsappConversation.count({ where: { unread: true } }),
    prisma.whatsappConversation.findMany({ where: { unread: true }, orderBy: { lastMessageAt: "desc" }, take: 5, include: { client: { select: { fullName: true } } } }),
    prisma.clientProfile.count({ where: newLeadWhere }),
    prisma.clientProfile.findMany({ where: newLeadWhere, orderBy: { createdAt: "desc" }, take: 5, include: { user: { select: { phone: true, email: true } } } }),
    prisma.booking.count({ where: { createdAt: { gte: startOfToday } } }),
    prisma.booking.findMany({ where: { createdAt: { gte: startOfToday } }, orderBy: { createdAt: "desc" }, take: 5, include: { client: { select: { fullName: true } } } }),
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
  items.sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    total: inquiryCount + whatsappCount + leadCount + bookingCount,
    counts: { inquiry: inquiryCount, whatsapp: whatsappCount, lead: leadCount, booking: bookingCount },
    items: items.slice(0, 12),
  };
}
