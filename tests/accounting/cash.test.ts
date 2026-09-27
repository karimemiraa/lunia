import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  CashSessionError,
  closeCashSession,
  computeExpectedCash,
  expectedCashFrom,
  getOpenCashSession,
  openCashSession,
  staleOpenCashSession,
} from "@/modules/accounting/cash";
import { makeTag } from "./fixtures";

const TAG = makeTag("cash");
// CashSession.openedById has no FK, so a marker string keeps test rows findable.
const STAFF = `test-acc-${TAG}`;

async function removeTestSessions() {
  await prisma.payment.deleteMany({ where: { reference: { startsWith: TAG } } });
  await prisma.cashSession.deleteMany({ where: { openedById: { startsWith: "test-acc-" } } });
}

describe("cash drawer", () => {
  beforeAll(async () => {
    await removeTestSessions();
    // The rule is global: a real open session in this DB would make these
    // assertions meaningless, so fail loudly instead of silently passing.
    expect(await getOpenCashSession()).toBeNull();
  });

  afterAll(removeTestSessions);

  it("computes expected cash from float, cash receipts and cash refunds", () => {
    expect(expectedCashFrom(50_000, [30_000, 12_000, -5_000])).toEqual({
      openingFloatMinor: 50_000,
      cashInMinor: 42_000,
      cashRefundsMinor: 5_000,
      paymentCount: 3,
      expectedCashMinor: 87_000,
    });
    expect(expectedCashFrom(0, []).expectedCashMinor).toBe(0);
  });

  it("allows only one open session and records the variance on close", async () => {
    const session = await openCashSession({ openedById: STAFF, openingFloatMinor: 50_000 });
    await expect(openCashSession({ openedById: STAFF, openingFloatMinor: 1_000 })).rejects.toBeInstanceOf(CashSessionError);

    await prisma.payment.createMany({
      data: [
        { method: "CASH", amountMinor: 30_000, cashSessionId: session.id, reference: `${TAG}-1` },
        { method: "CASH", amountMinor: 12_000, cashSessionId: session.id, reference: `${TAG}-2` },
        { method: "CASH", amountMinor: -5_000, cashSessionId: session.id, reference: `${TAG}-refund` },
        // Not counted: card, failed cash, cash not tagged to this drawer.
        { method: "CARD", amountMinor: 20_000, cashSessionId: session.id, reference: `${TAG}-card` },
        { method: "CASH", amountMinor: 7_000, cashSessionId: session.id, status: "FAILED", reference: `${TAG}-failed` },
        { method: "CASH", amountMinor: 9_000, reference: `${TAG}-untagged` },
      ],
    });

    const live = await computeExpectedCash(session.id);
    expect(live.expectedCashMinor).toBe(87_000);
    expect(live.cashRefundsMinor).toBe(5_000);

    const closed = await closeCashSession({ sessionId: session.id, closedById: STAFF, countedCashMinor: 86_000, note: "short 10" });
    expect(closed.expectedCashMinor).toBe(87_000);
    expect(closed.countedCashMinor).toBe(86_000);
    expect(closed.varianceMinor).toBe(-1_000);
    expect(closed.closedAt).not.toBeNull();

    await expect(closeCashSession({ sessionId: session.id, closedById: STAFF, countedCashMinor: 1 })).rejects.toBeInstanceOf(CashSessionError);

    // Once closed, a new session may open.
    const next = await openCashSession({ openedById: STAFF, openingFloatMinor: 0 });
    await closeCashSession({ sessionId: next.id, closedById: STAFF, countedCashMinor: 0 });
  });

  it("serializes concurrent opens so exactly one wins", async () => {
    const results = await Promise.allSettled([
      openCashSession({ openedById: STAFF, openingFloatMinor: 100 }),
      openCashSession({ openedById: STAFF, openingFloatMinor: 200 }),
      openCashSession({ openedById: STAFF, openingFloatMinor: 300 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.cashSession.count({ where: { closedAt: null } })).toBe(1);
    const open = (await getOpenCashSession())!;
    await closeCashSession({ sessionId: open.id, closedById: STAFF, countedCashMinor: open.openingFloatMinor });
  });

  it("flags a drawer left open for more than 18 hours", async () => {
    const session = await openCashSession({ openedById: STAFF, openingFloatMinor: 0 });
    expect(await staleOpenCashSession()).toBeNull();
    const later = new Date(session.openedAt.getTime() + 19 * 3_600_000);
    expect((await staleOpenCashSession(later))?.id).toBe(session.id);
    await closeCashSession({ sessionId: session.id, closedById: STAFF, countedCashMinor: 0 });
  });

  it("rejects a negative float", async () => {
    await expect(openCashSession({ openedById: STAFF, openingFloatMinor: -1 })).rejects.toThrow();
  });
});
