// Per-assignee email digests: emails each staff member a summary of the open
// items assigned to them (inquiries to answer, leads with a due follow-up,
// unread WhatsApp threads). Sends through the same email pipeline as booking
// messages (stub outside production). Callable from the admin UI now, and
// ready to be wired to a daily cron later.

import { prisma } from "@/lib/db";
import { renderEmailHtml } from "@/modules/comms/emailLayout";
import { resolveSenderForChannel } from "@/modules/comms/sender";

interface DigestLine {
  label: string;
  href: string;
}

export interface DigestSendResult {
  assigneesNotified: number;
  emailsSent: number;
}

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

function buildEmailBody(name: string, lines: DigestLine[]): string {
  const first = name.trim().split(/\s+/)[0] || "there";
  const bullets = lines.map((l) => `• ${l.label}${BASE_URL ? `\n${BASE_URL}${l.href}` : ""}`).join("\n\n");
  return `You have ${lines.length} item${lines.length === 1 ? "" : "s"} waiting in Lunia:\n\n${bullets}\n\nOpen the admin to follow up.`;
}

export async function sendAssigneeDigests(): Promise<DigestSendResult> {
  const now = new Date();

  const [inquiries, leads, conversations] = await Promise.all([
    prisma.contactInquiry.findMany({ where: { handled: false, assignedToId: { not: null } } }),
    prisma.clientProfile.findMany({
      where: {
        ownerId: { not: null },
        stage: { in: ["LEAD", "ATTEMPTED", "CONTACTED", "FOLLOW_UP"] },
        OR: [{ nextFollowUpAt: null }, { nextFollowUpAt: { lte: now } }],
      },
    }),
    prisma.whatsappConversation.findMany({ where: { unread: true, ownerId: { not: null } }, include: { client: { select: { fullName: true } } } }),
  ]);

  // Group actionable items by the assigned staff userId.
  const byUser = new Map<string, DigestLine[]>();
  const push = (userId: string | null, line: DigestLine) => {
    if (!userId) return;
    const arr = byUser.get(userId) ?? [];
    arr.push(line);
    byUser.set(userId, arr);
  };

  for (const i of inquiries) push(i.assignedToId, { label: `Inquiry from ${i.name}`, href: `/admin/inquiries/${i.id}` });
  for (const l of leads) push(l.ownerId, { label: `Follow up with lead ${l.fullName}`, href: `/admin/clients/${l.id}` });
  for (const c of conversations) push(c.ownerId, { label: `WhatsApp reply from ${c.client?.fullName || c.phone}`, href: `/admin/whatsapp?c=${c.id}` });

  if (byUser.size === 0) return { assigneesNotified: 0, emailsSent: 0 };

  const users = await prisma.user.findMany({
    where: { id: { in: [...byUser.keys()] } },
    include: { staffProfile: true },
  });
  const sender = await resolveSenderForChannel("email");

  let emailsSent = 0;
  for (const user of users) {
    if (!user.email) continue;
    const lines = byUser.get(user.id) ?? [];
    if (lines.length === 0) continue;
    const name = user.staffProfile?.fullName ?? user.email;
    const body = buildEmailBody(name, lines);
    const subject = `Your Lunia digest — ${lines.length} item${lines.length === 1 ? "" : "s"} to follow up`;
    const result = await sender.send({ channel: "email", toEmail: user.email, subject, body, kind: "DIGEST", recipientName: name, locale: "en" });
    await prisma.communicationLog.create({
      data: {
        channel: "email",
        kind: "DIGEST",
        toEmail: user.email,
        status: result.ok ? "SENT" : "FAILED",
        body: renderEmailHtml({ subject, body, recipientName: name, locale: "en" }),
        providerRef: result.providerRef ?? null,
      },
    });
    if (result.ok) emailsSent += 1;
  }

  return { assigneesNotified: byUser.size, emailsSent };
}
