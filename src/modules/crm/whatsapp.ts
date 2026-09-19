// WhatsApp inbox: store inbound + outbound messages per conversation so a
// campaign reply can be answered right from the System. The actual send goes
// through a pluggable provider adapter — a stub in dev/CI that just logs and
// returns a synthetic ref, so the whole flow works now and a real Meta/Twilio
// adapter can be dropped in later (wire it in `sendViaProvider`).

import { prisma } from "@/lib/db";

export interface ConversationRow {
  id: string;
  phone: string;
  clientProfileId: string | null;
  clientName: string | null;
  lastMessageAt: Date;
  lastMessagePreview: string | null;
  unread: boolean;
}

export interface MessageRow {
  id: string;
  direction: string;
  body: string;
  authorName?: string;
  createdAt: Date;
}

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits.replace(/^0+/, "")}`;
}

/** Conversations, newest activity first, with the linked customer's name. */
export async function listConversations(): Promise<ConversationRow[]> {
  const convos = await prisma.whatsappConversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    include: { client: { select: { fullName: true } } },
  });
  return convos.map((c) => ({
    id: c.id,
    phone: c.phone,
    clientProfileId: c.clientProfileId,
    clientName: c.client?.fullName ?? null,
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    unread: c.unread,
  }));
}

/** One conversation + its messages (author names resolved); marks it read. */
export async function getConversation(id: string): Promise<{ conversation: ConversationRow; messages: MessageRow[] } | null> {
  const convo = await prisma.whatsappConversation.findUnique({ where: { id }, include: { client: { select: { fullName: true } } } });
  if (!convo) return null;

  const msgs = await prisma.whatsappMessage.findMany({ where: { conversationId: id }, orderBy: { createdAt: "asc" } });
  const authorIds = [...new Set(msgs.map((m) => m.authorUserId).filter((x): x is string => !!x))];
  const authors = authorIds.length ? await prisma.user.findMany({ where: { id: { in: authorIds } }, include: { staffProfile: true } }) : [];
  const nameById = new Map(authors.map((u) => [u.id, u.staffProfile?.fullName]));

  if (convo.unread) await prisma.whatsappConversation.update({ where: { id }, data: { unread: false } });

  return {
    conversation: {
      id: convo.id,
      phone: convo.phone,
      clientProfileId: convo.clientProfileId,
      clientName: convo.client?.fullName ?? null,
      lastMessageAt: convo.lastMessageAt,
      lastMessagePreview: convo.lastMessagePreview,
      unread: false,
    },
    messages: msgs.map((m) => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      authorName: m.authorUserId ? nameById.get(m.authorUserId) ?? undefined : undefined,
      createdAt: m.createdAt,
    })),
  };
}

/** Finds (or creates) the conversation for a phone, linking a customer if known. */
export async function startOrGetConversation(phone: string, clientProfileId?: string | null): Promise<string> {
  const normalized = normalizePhone(phone);
  const existing = await prisma.whatsappConversation.findUnique({ where: { phone: normalized } });
  if (existing) {
    if (clientProfileId && !existing.clientProfileId) {
      await prisma.whatsappConversation.update({ where: { id: existing.id }, data: { clientProfileId } });
    }
    return existing.id;
  }
  // Auto-link to a customer by phone if not provided.
  let linked = clientProfileId ?? null;
  if (!linked) {
    const user = await prisma.user.findUnique({ where: { phone: normalized }, include: { clientProfile: true } });
    linked = user?.clientProfile?.id ?? null;
  }
  const convo = await prisma.whatsappConversation.create({ data: { phone: normalized, clientProfileId: linked } });
  return convo.id;
}

// Pluggable outbound send. Replace this body with a real provider call
// (Meta Cloud API / Twilio / 360dialog) when credentials are configured.
async function sendViaProvider(phone: string, body: string): Promise<{ ok: boolean; providerRef?: string }> {
  console.info(`[whatsapp:stub] -> ${phone}: ${body}`);
  return { ok: true, providerRef: `stub-${Math.random().toString(36).slice(2, 10)}` };
}

/** Sends an outbound reply, storing it and updating the conversation. */
export async function sendWhatsappMessage(conversationId: string, body: string, byUserId: string): Promise<void> {
  const text = body.trim();
  if (!text) throw new Error("Message is empty");
  const convo = await prisma.whatsappConversation.findUnique({ where: { id: conversationId } });
  if (!convo) throw new Error("Conversation not found");

  const result = await sendViaProvider(convo.phone, text);
  await prisma.$transaction([
    prisma.whatsappMessage.create({ data: { conversationId, direction: "OUT", body: text, authorUserId: byUserId, providerRef: result.providerRef ?? null } }),
    prisma.whatsappConversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date(), lastMessagePreview: text.slice(0, 120), unread: false } }),
  ]);
}

/** Ingests an inbound message (called by the provider webhook). */
export async function ingestInbound(phone: string, body: string): Promise<void> {
  const conversationId = await startOrGetConversation(phone);
  await prisma.$transaction([
    prisma.whatsappMessage.create({ data: { conversationId, direction: "IN", body } }),
    prisma.whatsappConversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date(), lastMessagePreview: body.slice(0, 120), unread: true } }),
  ]);
}
