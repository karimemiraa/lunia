// "Send to customer": delivers the invoice link (plus an online pay link when
// something is due and a gateway is configured) over WhatsApp, SMS or email
// through the same template registry + sender resolution the booking outbox
// uses. With no provider configured the resolved sender is the logging stub,
// exactly like every other message — sending never throws at the caller.

import { prisma } from "@/lib/db";
import { renderTemplate } from "@/modules/comms/templates";
import { resolveSenderForChannel } from "@/modules/comms/sender";
import { subjectForTemplate } from "@/modules/comms/templateCatalog";
import { formatAmount } from "./money";
import { invoicePublicUrl } from "./token";
import { invoiceBalance } from "./settlement";
import { createPayLink, onlinePaymentsConfigured } from "./payments/links";

export type DeliveryChannel = "whatsapp" | "sms" | "email";

export interface SendInvoiceResult {
  ok: boolean;
  channel: DeliveryChannel;
  recipient?: string;
  payLinkUrl?: string;
  error?: string;
}

export async function sendInvoice(
  invoiceId: string,
  opts: { channel: DeliveryChannel; locale?: "ar" | "en"; includePayLink?: boolean },
): Promise<SendInvoiceResult> {
  const { channel } = opts;
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { client: { select: { fullName: true, user: { select: { phone: true, email: true, locale: true } } } } },
  });
  if (!inv) return { ok: false, channel, error: "Invoice not found" };
  if (inv.status === "DRAFT" || inv.status === "VOID") return { ok: false, channel, error: "Only issued invoices can be sent" };

  const locale = opts.locale ?? (inv.client?.user.locale === "en" ? "en" : "ar");
  const toPhone = inv.customerPhone || inv.client?.user.phone || undefined;
  const toEmail = inv.client?.user.email || undefined;
  if (channel === "email" ? !toEmail : !toPhone) {
    return { ok: false, channel, error: channel === "email" ? "No email address on file" : "No phone number on file" };
  }

  let payLinkUrl: string | undefined;
  try {
    if (opts.includePayLink && inv.kind === "INVOICE" && (await onlinePaymentsConfigured())) {
      const { balanceMinor } = await invoiceBalance(prisma, inv);
      if (balanceMinor > 0) payLinkUrl = (await createPayLink(inv.id, locale)).url ?? undefined;
    }
  } catch (err) {
    // A gateway hiccup should not block sending the invoice itself.
    console.error("[billing] pay link creation failed", err);
  }

  const name = (inv.client?.fullName || inv.customerName).trim().split(/\s+/)[0] ?? "";
  const params: Record<string, string> = {
    name,
    invoiceNumber: inv.number,
    total: locale === "ar" ? `${formatAmount(inv.totalMinor)} ر.س` : `${formatAmount(inv.totalMinor)} SAR`,
    link: invoicePublicUrl(inv.id, locale),
    payLine: payLinkUrl
      ? locale === "ar"
        ? `تقدرين تدفعين أونلاين بأمان من هنا: ${payLinkUrl}`
        : `Pay online securely here: ${payLinkUrl}`
      : "",
  };

  let body = "";
  try {
    ({ body } = await renderTemplate("INVOICE", locale, channel, params));
    body = body.replace(/\n{3,}/g, "\n\n").trim();
    const sender = await resolveSenderForChannel(channel);
    const result = await sender.send({
      channel,
      toPhone: channel === "email" ? undefined : toPhone,
      toEmail: channel === "email" ? toEmail : undefined,
      subject: channel === "email" ? subjectForTemplate("INVOICE", locale) : undefined,
      body,
      kind: "INVOICE",
      bookingId: inv.bookingId ?? undefined,
      recipientName: inv.client?.fullName ?? inv.customerName,
      locale,
    });
    await prisma.communicationLog.create({
      data: {
        channel,
        kind: "INVOICE",
        toPhone: channel === "email" ? null : (toPhone ?? null),
        toEmail: channel === "email" ? (toEmail ?? null) : null,
        bookingId: inv.bookingId,
        status: result.ok ? "SENT" : "FAILED",
        body,
        providerRef: result.providerRef ?? null,
      },
    });
    return {
      ok: result.ok,
      channel,
      recipient: channel === "email" ? toEmail : toPhone,
      payLinkUrl,
      error: result.ok ? undefined : "The provider rejected the message",
    };
  } catch (err) {
    console.error("[billing] invoice send failed", err);
    await prisma.communicationLog
      .create({
        data: { channel, kind: "INVOICE", toPhone: toPhone ?? null, toEmail: toEmail ?? null, bookingId: inv.bookingId, status: "FAILED", body },
      })
      .catch(() => undefined);
    return { ok: false, channel, error: "Sending failed — see the communications log" };
  }
}
