import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";
import { centerLocalToUtc } from "@/modules/booking/availability";
import { runTool, toolsFor } from "@/modules/staffAssistant/tools";
import { answerWithRules } from "@/modules/staffAssistant/rules";
import { createEditRequest, listEditRequests, updateEditRequestStatus, countOpenEditRequests } from "@/modules/editRequests/editRequests";
import type { AssistantViewer } from "@/modules/staffAssistant/types";
import { makeInvoice, makeTag, cleanup } from "../accounting/fixtures";

// The assistant's numbers are checked against rows created here, in March 2033
// (a month no other suite writes to), so every figure is known exactly.

const ALL = new Set(Object.values(PERMISSIONS) as PermissionKey[]);
const owner: AssistantViewer = { id: `assist-owner-${Date.now()}`, name: "Owner", permissions: ALL };
const frontDesk: AssistantViewer = {
  id: `assist-desk-${Date.now()}`,
  name: "Desk",
  permissions: new Set<PermissionKey>([PERMISSIONS.BOOKING_VIEW, PERMISSIONS.BOOKING_MANAGE, PERMISSIONS.CLIENT_VIEW]),
};
const NOW = centerLocalToUtc("2033-03-15", 720); // noon Riyadh, 15 Mar 2033
const tag = makeTag("assistant");

const stat = (r: { stats: { label: string; value: string }[] }, label: string) => r.stats.find((s) => s.label === label)?.value;
const sar = (v: string | undefined) => Number((v ?? "").replace(/[^0-9.-]/g, ""));

describe("assistant data tools (exact numbers)", () => {
  beforeAll(async () => {
    // March: invoice 115.00 paid in full, then a 23.00 credit note refunded in cash.
    const a = await makeInvoice(tag, { dateISO: "2033-03-10", status: "PAID", paidMinor: 11500, lines: [{ netMinor: 10000 }] });
    const cn = await makeInvoice(tag, { dateISO: "2033-03-12", kind: "CREDIT_NOTE", originalInvoiceId: a.id, lines: [{ netMinor: 2000 }] });
    await prisma.payment.createMany({
      data: [
        { invoiceId: a.id, method: "CASH", amountMinor: 11500, receivedAt: centerLocalToUtc("2033-03-10", 720), reference: `${tag}-p1` },
        { invoiceId: cn.id, method: "CASH", amountMinor: -2300, receivedAt: centerLocalToUtc("2033-03-12", 720), reference: `${tag}-r1` },
        // A failed card attempt must not count.
        { invoiceId: a.id, method: "CARD", amountMinor: 999, status: "FAILED", receivedAt: centerLocalToUtc("2033-03-10", 700), reference: `${tag}-f1` },
      ],
    });
    // February: one 57.50 sale.
    const b = await makeInvoice(tag, { dateISO: "2033-02-20", status: "PAID", paidMinor: 5750, lines: [{ netMinor: 5000 }] });
    await prisma.payment.create({ data: { invoiceId: b.id, method: "MADA", amountMinor: 5750, receivedAt: centerLocalToUtc("2033-02-20", 720), reference: `${tag}-p2` } });
  });

  afterAll(async () => {
    await cleanup(tag);
    await prisma.editRequest.deleteMany({ where: { createdById: { in: [owner.id, frontDesk.id] } } });
    await prisma.clientProfile.deleteMany({ where: { fullName: { startsWith: tag } } });
    await prisma.user.deleteMany({ where: { phone: { startsWith: "+9665998" }, clientProfile: null, type: "CLIENT" } });
  });

  it("revenue: collected is net of refunds, failed payments excluded, invoiced is net of credit notes", async () => {
    const march = await runTool("revenue_summary", { period: "this_month" }, owner, NOW);
    expect(stat(march, "Collected (net of refunds)")).toBe("92 SAR");
    expect(stat(march, "Payments")).toBe("2");
    expect(stat(march, "Invoiced")).toBe("92 SAR");

    const feb = await runTool("revenue_summary", { period: "last_month" }, owner, NOW);
    expect(stat(feb, "Collected (net of refunds)")).toBe("57.5 SAR");
    expect(stat(feb, "Invoiced")).toBe("57.5 SAR");

    const today = await runTool("revenue_summary", { period: "today" }, owner, NOW);
    expect(stat(today, "Collected (net of refunds)")).toBe("0 SAR");
  });

  it("revenue via the built-in engine (English + Arabic) gives the same figures", async () => {
    const en = await answerWithRules("What was revenue last month?", owner, NOW);
    expect(en.stats?.find((s) => s.label === "Collected (net of refunds)")?.value).toBe("57.5 SAR");
    const ar = await answerWithRules("كم الإيرادات هذا الشهر؟", owner, NOW);
    expect(ar.stats?.find((s) => s.label === "Collected (net of refunds)")?.value).toBe("92 SAR");
  });

  it("unpaid invoices: outstanding is net of payments and credit notes (matches accounting)", async () => {
    const before = await runTool("unpaid_invoices", {}, owner, NOW);
    // 115.00 invoice, 20.00 paid, 23.00 credited → 72.00 still owed.
    const c = await makeInvoice(tag, { dateISO: "2033-03-14", status: "PARTIALLY_PAID", paidMinor: 2000, lines: [{ netMinor: 10000 }] });
    await makeInvoice(tag, { dateISO: "2033-03-14", kind: "CREDIT_NOTE", originalInvoiceId: c.id, lines: [{ netMinor: 2000 }] });
    const after = await runTool("unpaid_invoices", {}, owner, NOW);
    expect(Number(stat(after, "Open invoices")!.replace(/,/g, "")) - Number(stat(before, "Open invoices")!.replace(/,/g, ""))).toBe(1);
    expect(Math.round((sar(stat(after, "Outstanding")) - sar(stat(before, "Outstanding"))) * 100)).toBe(7200);
  });

  it("never runs a tool the role doesn't allow (even if asked directly)", async () => {
    expect(toolsFor(frontDesk).map((t) => t.name)).not.toContain("revenue_summary");
    const denied = await runTool("revenue_summary", { period: "this_month" }, frontDesk, NOW);
    expect(denied.title).toBe("Not available");
    expect(denied.stats).toEqual([]);
  });

  it("rejects invalid tool input", async () => {
    await expect(runTool("revenue_summary", { period: "decade" }, owner, NOW)).rejects.toThrow();
    await expect(runTool("no_such_tool", {}, owner, NOW)).rejects.toThrow(/Unknown tool/);
  });

  it("find_customer: one match gives pre-filled booking/invoice links, per permission", async () => {
    const phone = `+9665998${String(Date.now()).slice(-5)}`;
    const user = await prisma.user.create({ data: { type: "CLIENT", phone, clientProfile: { create: { fullName: `${tag} Noura` } } }, include: { clientProfile: true } });
    const ownerResult = await runTool("find_customer", { query: `${tag} Noura` }, owner, NOW);
    expect(ownerResult.links.map((l) => l.href)).toEqual([
      `/admin/clients/${user.clientProfile!.id}`,
      `/admin/calendar?${new URLSearchParams({ add: "1", name: `${tag} Noura`, phone }).toString()}`,
      `/admin/billing/new?client=${user.clientProfile!.id}`,
    ]);
    const deskResult = await runTool("find_customer", { query: `${tag} Noura` }, frontDesk, NOW);
    expect(deskResult.links.some((l) => l.href.startsWith("/admin/billing"))).toBe(false);

    // "book <name>" opens the booking form pre-filled for that customer.
    const book = await answerWithRules(`book ${tag} Noura`, frontDesk, NOW);
    expect(book.navigateTo).toContain("/admin/calendar?add=1");
    expect(book.navigateTo).toContain(encodeURIComponent(phone).replace(/%20/g, "+"));
    await prisma.user.delete({ where: { id: user.id } });
  });
});

describe("edit requests", () => {
  it("are created, listed, closed with a reply, and shown back to the requester", async () => {
    const openBefore = await countOpenEditRequests();
    const req = await createEditRequest({ title: "Add supplier phone column", details: "On the products list, please.", priority: "HIGH", pagePath: "/admin/inventory" }, frontDesk);
    expect(req.status).toBe("OPEN");
    expect(await countOpenEditRequests()).toBe(openBefore + 1);
    expect((await listEditRequests({ status: "OPEN" })).some((r) => r.id === req.id)).toBe(true);

    const mine = await runTool("my_edit_requests", {}, frontDesk, NOW);
    expect(stat(mine, "Add supplier phone column")).toBe("Open");

    const done = await updateEditRequestStatus({ id: req.id, status: "DONE", resolutionNote: "Shipped" }, owner.id);
    expect(done.resolvedById).toBe(owner.id);
    expect(done.resolvedAt).toBeInstanceOf(Date);
    expect(await countOpenEditRequests()).toBe(openBefore);
    const mineAfter = await runTool("my_edit_requests", {}, frontDesk, NOW);
    expect(stat(mineAfter, "Add supplier phone column")).toBe("Done — Shipped");

    // Reopening clears the resolution stamp.
    const reopened = await updateEditRequestStatus({ id: req.id, status: "IN_PROGRESS" }, owner.id);
    expect(reopened.resolvedAt).toBeNull();
  });

  it("validates input", async () => {
    await expect(createEditRequest({ title: "x", details: "long enough" }, frontDesk)).rejects.toThrow();
    await expect(createEditRequest({ title: "Valid title", details: "Valid details", pagePath: "javascript:alert(1)" }, frontDesk)).rejects.toThrow();
  });
});
