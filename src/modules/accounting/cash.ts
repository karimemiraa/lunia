// Front-desk cash drawer sessions. One session may be open at a time: it
// opens with a counted float, collects every CASH payment the billing module
// tags with its cashSessionId, and closes with a physical count. Expected
// cash = float + cash received - cash refunded (refunds are negative Payment
// rows); the variance is counted - expected and is kept on the row via
// expectedCashMinor/countedCashMinor.

import { z } from "zod";
import { prisma } from "@/lib/db";

// Any fixed 64-bit key: serializes "is a session open? then open one" across
// concurrent requests without a schema-level partial unique index.
const CASH_SESSION_LOCK_KEY = 7_214_300_118;

/** A drawer left open longer than this is flagged in the notification center. */
export const STALE_SESSION_HOURS = 18;

const amountSchema = z.number().int().min(0, "Amount can't be negative.").max(100_000_000);

export class CashSessionError extends Error {}

export interface CashTotals {
  openingFloatMinor: number;
  cashInMinor: number;
  cashRefundsMinor: number;
  paymentCount: number;
  expectedCashMinor: number;
}

/**
 * Expected cash for a session. Counts every non-FAILED CASH payment row tagged
 * with the session: receipts are positive, refunds negative (a refunded
 * original stays in -- its negative refund row is what takes the cash out).
 */
export async function computeExpectedCash(sessionId: string): Promise<CashTotals> {
  const session = await prisma.cashSession.findUniqueOrThrow({ where: { id: sessionId } });
  const payments = await prisma.payment.findMany({
    where: { cashSessionId: sessionId, method: "CASH", status: { not: "FAILED" } },
    select: { amountMinor: true },
  });
  return expectedCashFrom(session.openingFloatMinor, payments.map((p) => p.amountMinor));
}

/** Pure arithmetic behind computeExpectedCash (exported for tests). */
export function expectedCashFrom(openingFloatMinor: number, amounts: number[]): CashTotals {
  let cashInMinor = 0;
  let cashRefundsMinor = 0;
  for (const amount of amounts) {
    if (amount >= 0) cashInMinor += amount;
    else cashRefundsMinor += -amount;
  }
  return {
    openingFloatMinor,
    cashInMinor,
    cashRefundsMinor,
    paymentCount: amounts.length,
    expectedCashMinor: openingFloatMinor + cashInMinor - cashRefundsMinor,
  };
}

export async function getOpenCashSession() {
  return prisma.cashSession.findFirst({ where: { closedAt: null }, orderBy: { openedAt: "desc" } });
}

export async function openCashSession(input: { openedById: string; openingFloatMinor: number; note?: string | null }) {
  const openingFloatMinor = amountSchema.parse(input.openingFloatMinor);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CASH_SESSION_LOCK_KEY}::bigint)`;
    const open = await tx.cashSession.findFirst({ where: { closedAt: null } });
    if (open) throw new CashSessionError("A cash drawer session is already open. Close it before opening a new one.");
    return tx.cashSession.create({
      data: { openedById: input.openedById, openingFloatMinor, note: input.note?.trim() || null },
    });
  });
}

export async function closeCashSession(input: { sessionId: string; closedById: string; countedCashMinor: number; note?: string | null }) {
  const countedCashMinor = amountSchema.parse(input.countedCashMinor);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CASH_SESSION_LOCK_KEY}::bigint)`;
    const session = await tx.cashSession.findUnique({ where: { id: input.sessionId } });
    if (!session) throw new CashSessionError("Cash session not found.");
    if (session.closedAt) throw new CashSessionError("This cash session is already closed.");
    const payments = await tx.payment.findMany({
      where: { cashSessionId: session.id, method: "CASH", status: { not: "FAILED" } },
      select: { amountMinor: true },
    });
    const { expectedCashMinor } = expectedCashFrom(session.openingFloatMinor, payments.map((p) => p.amountMinor));
    const note = [session.note, input.note?.trim()].filter(Boolean).join("\n") || null;
    const closed = await tx.cashSession.update({
      where: { id: session.id },
      data: { closedAt: new Date(), closedById: input.closedById, countedCashMinor, expectedCashMinor, note },
    });
    return { ...closed, varianceMinor: countedCashMinor - expectedCashMinor };
  });
}

export interface CashSessionRow {
  id: string;
  openedAt: Date;
  openedBy: string;
  closedAt: Date | null;
  closedBy: string | null;
  openingFloatMinor: number;
  expectedCashMinor: number | null;
  countedCashMinor: number | null;
  varianceMinor: number | null;
  note: string | null;
}

/** Staff display names for a set of user ids (full name, else email/phone). */
export async function staffNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, email: true, phone: true, staffProfile: { select: { fullName: true } } },
  });
  return new Map(users.map((u) => [u.id, u.staffProfile?.fullName || u.email || u.phone || "Staff"]));
}

export async function listCashSessions(limit = 50): Promise<CashSessionRow[]> {
  const sessions = await prisma.cashSession.findMany({ orderBy: { openedAt: "desc" }, take: Math.min(Math.max(limit, 1), 500) });
  const names = await staffNames(sessions.flatMap((s) => [s.openedById, s.closedById ?? ""]));
  return sessions.map((s) => ({
    id: s.id,
    openedAt: s.openedAt,
    openedBy: names.get(s.openedById) ?? "Staff",
    closedAt: s.closedAt,
    closedBy: s.closedById ? (names.get(s.closedById) ?? "Staff") : null,
    openingFloatMinor: s.openingFloatMinor,
    expectedCashMinor: s.expectedCashMinor,
    countedCashMinor: s.countedCashMinor,
    varianceMinor:
      s.countedCashMinor !== null && s.expectedCashMinor !== null ? s.countedCashMinor - s.expectedCashMinor : null,
    note: s.note,
  }));
}

/**
 * CASH payments received while the drawer was open but not tagged to any
 * session -- a hint that the till and the system may disagree.
 */
export async function untaggedCashSince(since: Date): Promise<{ count: number; amountMinor: number }> {
  const agg = await prisma.payment.aggregate({
    where: { method: "CASH", cashSessionId: null, status: { not: "FAILED" }, receivedAt: { gte: since } },
    _count: true,
    _sum: { amountMinor: true },
  });
  return { count: agg._count, amountMinor: agg._sum.amountMinor ?? 0 };
}

export async function staleOpenCashSession(now: Date = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_SESSION_HOURS * 3_600_000);
  return prisma.cashSession.findFirst({ where: { closedAt: null, openedAt: { lt: cutoff } }, orderBy: { openedAt: "asc" } });
}
