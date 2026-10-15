// Public gift-card purchase flow. Records an order, "charges" it through a
// pluggable payment gateway (a stub outside production, so the whole flow
// works today), then issues the GiftCard and emails the code. No card details
// are ever collected or stored here — a real gateway handles that on its own
// hosted page; PAYMENT_* credentials live in the superadmin panel.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { issueGiftCard } from "@/modules/commerce/giftcards";
import { renderEmailHtml } from "@/modules/comms/emailLayout";
import { resolveSenderForChannel } from "@/modules/comms/sender";

// Amount bounds (minor units / halalas): 50–5000 SAR.
export const GIFT_MIN_MINOR = 5000;
export const GIFT_MAX_MINOR = 500000;
export const GIFT_PRESETS_MINOR = [20000, 30000, 50000, 100000];

const purchaseSchema = z.object({
  amountMinor: z.number().int().min(GIFT_MIN_MINOR).max(GIFT_MAX_MINOR),
  purchaserName: z.string().trim().min(1).max(120),
  purchaserEmail: z.string().trim().email(),
  recipientName: z.string().trim().max(120).optional(),
  recipientEmail: z.string().trim().email().optional().or(z.literal("")),
  message: z.string().trim().max(500).optional(),
  locale: z.enum(["ar", "en"]).default("ar"),
});
export type PurchaseGiftInput = z.input<typeof purchaseSchema>;

export type PurchaseGiftResult =
  | { ok: true; code: string; amountMinor: number }
  | { ok: false; error: string };

// Charge step. No payment gateway is wired for online gift-card sales yet, so
// in production this ALWAYS declines — a card is only ever issued against a
// real payment (staff can still issue cards from the admin after taking
// payment at the desk). Outside production it approves with a stub ref so the
// flow stays testable. (Previously production approved whenever the payment
// secrets were missing, which handed out free gift cards.)
export async function chargeGiftCard(orderId: string, _amountMinor: number): Promise<{ ok: boolean; ref: string }> {
  if (process.env.NODE_ENV === "production") return { ok: false, ref: "" };
  return { ok: true, ref: `stub-${orderId.slice(-8)}` };
}

/** Whether the public site can sell gift cards online right now. */
export function onlineGiftSalesAvailable(): boolean {
  return process.env.NODE_ENV !== "production";
}

export async function purchaseGiftCard(input: PurchaseGiftInput): Promise<PurchaseGiftResult> {
  const data = purchaseSchema.parse(input);
  const recipientEmail = data.recipientEmail && data.recipientEmail.length > 0 ? data.recipientEmail : null;

  const order = await prisma.giftCardOrder.create({
    data: {
      amountMinor: data.amountMinor,
      purchaserName: data.purchaserName,
      purchaserEmail: data.purchaserEmail,
      recipientName: data.recipientName ?? null,
      recipientEmail,
      message: data.message ?? null,
      status: "PENDING",
    },
  });

  const charge = await chargeGiftCard(order.id, data.amountMinor);
  if (!charge.ok) {
    await prisma.giftCardOrder.update({ where: { id: order.id }, data: { status: "FAILED" } });
    return { ok: false, error: "unavailable" };
  }

  const card = await issueGiftCard({ initialMinor: data.amountMinor });
  await prisma.giftCardOrder.update({
    where: { id: order.id },
    data: { status: "PAID", giftCardId: card.id, paymentRef: charge.ref },
  });

  // Email the code to the recipient if given, otherwise the purchaser.
  const to = recipientEmail ?? data.purchaserEmail;
  const toName = data.recipientName ?? data.purchaserName;
  const amountSar = (data.amountMinor / 100).toLocaleString(data.locale === "ar" ? "ar-SA" : "en-US");
  const isAr = data.locale === "ar";
  const body = isAr
    ? `مبروك! وصلتك بطاقة هدية من لونيا بقيمة ${amountSar} ريال.\n\nكود البطاقة: ${card.code}\n\n${data.message ? `رسالة من ${data.purchaserName}: ${data.message}\n\n` : ""}استخدمي الكود وقت الحجز أونلاين أو في المركز.`
    : `You've received a Lunia gift card worth ${amountSar} SAR.\n\nGift card code: ${card.code}\n\n${data.message ? `Message from ${data.purchaserName}: ${data.message}\n\n` : ""}Use the code when booking or at the center.`;
  const subject = isAr ? "وصلتك بطاقة هدية من لونيا" : "Your Lunia gift card";
  try {
    const sender = await resolveSenderForChannel("email");
    const result = await sender.send({ channel: "email", toEmail: to, subject, body, kind: "GIFT_CARD", recipientName: toName, locale: data.locale });
    await prisma.communicationLog.create({
      data: {
        channel: "email",
        kind: "GIFT_CARD",
        toEmail: to,
        status: result.ok ? "SENT" : "FAILED",
        body: renderEmailHtml({ subject, body, recipientName: toName, locale: data.locale }),
        providerRef: result.providerRef ?? null,
      },
    });
  } catch (err) {
    // Delivery failure must not lose the sale — the code is still shown on-screen.
    console.error("[purchaseGiftCard] email failed", err);
  }

  return { ok: true, code: card.code, amountMinor: data.amountMinor };
}
