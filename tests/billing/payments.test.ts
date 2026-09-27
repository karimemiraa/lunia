import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createDraft, createDraftFromBooking, issueInvoice } from "@/modules/billing/invoices";
import { recordPayment } from "@/modules/billing/settlement";
import { createPayLink, handleMoyasarWebhook, onlinePaymentsConfigured } from "@/modules/billing/payments/links";
import { sendInvoice } from "@/modules/billing/delivery";
import { setSecret } from "@/modules/platform/secrets";
import { POST as webhookRoute } from "@/app/api/payments/moyasar/webhook/route";
import { TAG, makeBooking, makeClient, makeService, openCashSession, setupBilling, teardownBilling, walkInDraft } from "./fixtures";

beforeAll(setupBilling);
afterAll(teardownBilling);
afterEach(() => {
  vi.unstubAllGlobals();
});

async function issued(totalInclMinor: number) {
  return issueInvoice((await createDraft(walkInDraft(totalInclMinor))).id);
}

describe("billing/settlement payments", () => {
  it("moves ISSUED → PARTIALLY_PAID → PAID with a split payment and rejects overpaying", async () => {
    const inv = await issued(50_000);
    expect(inv.status).toBe("ISSUED");

    const r1 = await recordPayment({ invoiceId: inv.id, method: "MADA", amountMinor: 20_000 });
    expect(r1.invoice.status).toBe("PARTIALLY_PAID");
    expect(r1.invoice.paidMinor).toBe(20_000);

    await expect(recordPayment({ invoiceId: inv.id, method: "CARD", amountMinor: 30_001 })).rejects.toThrow(/more than the balance/);

    const r2 = await recordPayment({ invoiceId: inv.id, method: "APPLE_PAY", amountMinor: 30_000 });
    expect(r2.invoice.status).toBe("PAID");
    expect(r2.invoice.paidMinor).toBe(50_000);
    await expect(recordPayment({ invoiceId: inv.id, method: "CASH", amountMinor: 1 })).rejects.toThrow(/already paid/);
  });

  it("refuses payments on drafts", async () => {
    const draft = await createDraft(walkInDraft(1_000));
    await expect(recordPayment({ invoiceId: draft.id, method: "CASH", amountMinor: 1_000 })).rejects.toThrow(/Issue the invoice/);
  });

  it("cash: returns change and attaches the open cash drawer session", async () => {
    const session = await openCashSession();
    const inv = await issued(17_250);
    const r = await recordPayment({ invoiceId: inv.id, method: "CASH", amountMinor: 17_250, tenderedMinor: 20_000 });
    expect(r.changeMinor).toBe(2_750);
    expect(r.payment.amountMinor).toBe(17_250);
    expect(r.payment.cashSessionId).toBe(session.id);
    expect(r.invoice.status).toBe("PAID");

    // Card payments are never tied to the drawer.
    const inv2 = await issued(1_000);
    const card = await recordPayment({ invoiceId: inv2.id, method: "CARD", amountMinor: 1_000 });
    expect(card.payment.cashSessionId).toBeNull();
    await prisma.cashSession.update({ where: { id: session.id }, data: { closedAt: new Date() } });
  });

  it("marks the booking deposit PAID once its invoice is fully paid", async () => {
    const client = await makeClient();
    const svc = await makeService(30_000);
    const booking = await makeBooking(client.profileId, [{ id: svc.id, priceMinor: 30_000 }]);
    const inv = await issueInvoice((await createDraftFromBooking(booking.id)).id);
    await recordPayment({ invoiceId: inv.id, method: "CARD", amountMinor: 10_000 });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).depositStatus).toBe("NONE");
    await recordPayment({ invoiceId: inv.id, method: "CARD", amountMinor: 20_000 });
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).depositStatus).toBe("PAID");
  });

  it("redeems a gift card as payment and masks the code", async () => {
    const card = await prisma.giftCard.create({ data: { code: `${TAG}-GC-ABCD-9XYZ`, initialMinor: 30_000, balanceMinor: 30_000 } });
    const inv = await issued(50_000);
    const r = await recordPayment({ invoiceId: inv.id, method: "GIFT_CARD", amountMinor: 30_000, giftCardCode: card.code });
    expect(r.invoice.status).toBe("PARTIALLY_PAID");
    expect(r.payment.reference).toBe("Gift card ••••9XYZ");
    const after = await prisma.giftCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(after.balanceMinor).toBe(0);
    expect(after.status).toBe("REDEEMED");
    await expect(
      recordPayment({ invoiceId: inv.id, method: "GIFT_CARD", amountMinor: 1_000, giftCardCode: card.code }),
    ).rejects.toThrow(/already been fully redeemed/);
    // No payment row was written for the failed redemption.
    expect(await prisma.payment.count({ where: { invoiceId: inv.id } })).toBe(1);
  });
});

describe("billing/payments online pay links (Moyasar)", () => {
  function mockMoyasar(state: { status: string; amount: number }) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ id: "moy_inv_1", status: "initiated", amount: body.amount, currency: "SAR", url: "https://checkout.moyasar.com/invoices/moy_inv_1" }), { status: 201 });
      }
      return new Response(
        JSON.stringify({ id: "moy_inv_1", status: state.status, amount: state.amount, payments: state.status === "paid" ? [{ id: "pay_123", status: "paid", amount: state.amount }] : [] }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    return { calls, fetchMock };
  }

  it("is hidden/refused when no gateway is configured", async () => {
    expect(await onlinePaymentsConfigured()).toBe(false);
    const inv = await issued(1_000);
    await expect(createPayLink(inv.id)).rejects.toThrow(/not configured/);
  });

  it("creates a link for the open balance and records the webhook payment exactly once", async () => {
    await setSecret("PAYMENT_PROVIDER", "moyasar");
    await setSecret("PAYMENT_SECRET_KEY", "sk_test_123");
    await setSecret("PAYMENT_WEBHOOK_SECRET", "whsec_abc");
    const inv = await issued(23_000);
    await recordPayment({ invoiceId: inv.id, method: "CASH", amountMinor: 3_000 });

    const state = { status: "initiated", amount: 20_000 };
    const { calls } = mockMoyasar(state);
    const link = await createPayLink(inv.id, "en");
    expect(link).toMatchObject({ provider: "moyasar", providerRef: "moy_inv_1", amountMinor: 20_000, status: "PENDING" });
    expect(calls[0]!.url).toBe("https://api.moyasar.com/v1/invoices");
    const sent = JSON.parse(String(calls[0]!.init!.body));
    expect(sent).toMatchObject({ amount: 20_000, currency: "SAR" });
    expect(sent.callback_url).toMatch(/\/api\/payments\/moyasar\/webhook$/);
    expect(sent.back_url).toMatch(/\/en\/invoice\//);
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("sk_test_123:").toString("base64")}`,
    );
    // Asking again reuses the pending link.
    expect((await createPayLink(inv.id, "en")).id).toBe(link.id);

    const event = { id: "evt_1", type: "payment_paid", secret_token: "whsec_abc", data: { id: "pay_123", status: "paid", amount: 20_000, invoice_id: "moy_inv_1" } };

    // Wrong secret → 401, nothing recorded.
    expect((await handleMoyasarWebhook({ ...event, secret_token: "nope" })).status).toBe(401);
    expect((await handleMoyasarWebhook({ ...event, secret_token: undefined })).status).toBe(401);

    // Gateway says not paid yet → nothing recorded even with a valid secret.
    const notYet = await handleMoyasarWebhook(event);
    expect(notYet).toMatchObject({ status: 200, body: { recorded: false } });

    state.status = "paid";
    // Concurrent + repeated deliveries record one payment.
    const results = await Promise.all([handleMoyasarWebhook(event), handleMoyasarWebhook(event), handleMoyasarWebhook(event)]);
    expect(results.filter((r) => r.status === 200 && r.body.ok && r.body.recorded)).toHaveLength(1);
    const again = await webhookRoute(new Request("http://x/api/payments/moyasar/webhook", { method: "POST", body: JSON.stringify(event) }));
    expect(again.status).toBe(200);
    expect((await again.json()).recorded).toBe(false);

    const payments = await prisma.payment.findMany({ where: { invoiceId: inv.id, method: "ONLINE" } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amountMinor: 20_000, provider: "moyasar", providerRef: "pay_123" });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");
    expect((await prisma.paymentLink.findUniqueOrThrow({ where: { id: link.id } })).status).toBe("PAID");
  });

  it("also accepts the invoice callback shape, verified by re-fetching from the gateway", async () => {
    const inv = await issued(5_000);
    const state = { status: "initiated", amount: 5_000 };
    mockMoyasar(state);
    await prisma.paymentLink.deleteMany({ where: { providerRef: "moy_inv_1" } });
    await createPayLink(inv.id);
    // A forged "paid" callback is ignored while the gateway still says initiated.
    expect((await handleMoyasarWebhook({ id: "moy_inv_1", status: "paid", amount: 5_000 })).body).toMatchObject({ recorded: false });
    state.status = "paid";
    expect((await handleMoyasarWebhook({ id: "moy_inv_1", status: "paid", amount: 5_000 })).body).toMatchObject({ recorded: true });
    expect((await handleMoyasarWebhook({ id: "unknown_ref" })).status).toBe(404);
  });

  it("sends the invoice with its pay link through the (stub) sender and logs it", async () => {
    const client = await makeClient();
    const svc = await makeService(11_500);
    const booking = await makeBooking(client.profileId, [{ id: svc.id, priceMinor: 11_500 }]);
    const inv = await issueInvoice((await createDraftFromBooking(booking.id)).id);
    mockMoyasar({ status: "initiated", amount: 11_500 });
    await prisma.paymentLink.deleteMany({ where: { providerRef: "moy_inv_1" } });
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const res = await sendInvoice(inv.id, { channel: "whatsapp", locale: "ar", includePayLink: true });
    expect(res).toMatchObject({ ok: true, recipient: client.phone, payLinkUrl: "https://checkout.moyasar.com/invoices/moy_inv_1" });
    const log = await prisma.communicationLog.findFirstOrThrow({ where: { kind: "INVOICE", toPhone: client.phone } });
    expect(log.body).toContain(inv.number);
    expect(log.body).toContain("/ar/invoice/");
    expect(log.body).toContain("https://checkout.moyasar.com/invoices/moy_inv_1");

    // No email on file → a clear error, no crash.
    expect(await sendInvoice(inv.id, { channel: "email" })).toMatchObject({ ok: false, error: "No email address on file" });
    // Drafts can't be sent.
    const draft = await createDraft(walkInDraft(1_000));
    expect((await sendInvoice(draft.id, { channel: "sms" })).ok).toBe(false);
    info.mockRestore();
  });
});
