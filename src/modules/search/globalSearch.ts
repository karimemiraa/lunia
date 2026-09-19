// Whole-system search across customers/leads, inquiries, and WhatsApp threads.
// Read-only, permission-gated by the calling page. Each hit carries a link so
// the admin can jump straight to the record.

import { prisma } from "@/lib/db";

export interface SearchHit {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  badge?: string;
}
export interface GlobalSearchResult {
  customers: SearchHit[];
  inquiries: SearchHit[];
  conversations: SearchHit[];
}

const LIMIT = 12;

export async function globalSearch(query: string): Promise<GlobalSearchResult> {
  const q = query.trim();
  if (q.length < 2) return { customers: [], inquiries: [], conversations: [] };
  const contains = { contains: q, mode: "insensitive" as const };

  const [customers, inquiries, conversations] = await Promise.all([
    prisma.clientProfile.findMany({
      where: { OR: [{ fullName: contains }, { user: { phone: contains } }, { user: { email: contains } }] },
      include: { user: true },
      take: LIMIT,
      orderBy: { fullName: "asc" },
    }),
    prisma.contactInquiry.findMany({
      where: { OR: [{ name: contains }, { phone: contains }, { message: contains }] },
      take: LIMIT,
      orderBy: { createdAt: "desc" },
    }),
    prisma.whatsappConversation.findMany({
      where: { OR: [{ phone: contains }, { client: { fullName: contains } }] },
      include: { client: { select: { fullName: true } } },
      take: LIMIT,
      orderBy: { lastMessageAt: "desc" },
    }),
  ]);

  return {
    customers: customers.map((c) => ({
      id: c.id,
      title: c.fullName || "Unnamed customer",
      subtitle: c.user.phone ?? c.user.email ?? undefined,
      href: `/admin/clients/${c.id}`,
      badge: c.stage,
    })),
    inquiries: inquiries.map((i) => ({
      id: i.id,
      title: i.name,
      subtitle: i.phone,
      href: `/admin/inquiries/${i.id}`,
      badge: i.handled ? "Handled" : "New",
    })),
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.client?.fullName || c.phone,
      subtitle: c.lastMessagePreview ?? undefined,
      href: `/admin/whatsapp?c=${c.id}`,
    })),
  };
}
