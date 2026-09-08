import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { scheduleMessage, processDueMessages, renderMessageBody, stubSender } from "@/modules/booking/outbox";
import type { CommsSender } from "@/modules/booking/outbox";

// Every phone created by this suite carries this prefix so cleanup can find
// (and remove) everything it created, regardless of which test created it or
// whether an assertion failed partway through.
const PHONE_PREFIX = `+9665OUTBOX${Date.now()}`;
let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  return `${PHONE_PREFIX}${phoneCounter}`;
}

afterEach(async () => {
  const messages = await prisma.scheduledMessage.findMany({ where: { toPhone: { startsWith: PHONE_PREFIX } } });
  await prisma.communicationLog.deleteMany({ where: { toPhone: { startsWith: PHONE_PREFIX } } });
  await prisma.scheduledMessage.deleteMany({ where: { id: { in: messages.map((m) => m.id) } } });
});

// processDueMessages() scans the whole ScheduledMessage table for due
// PENDING rows, so the exact processed/sent/failed counts asserted below
// only hold if the table has no *other* due-and-PENDING rows left over
// (e.g. orphaned rows from an earlier interrupted test run, or another
// suite's fixtures that happen to be immediately due). Drain any such stray
// rows once, up front, before this file's own processDueMessages
// assertions run. vitest.config.ts also disables cross-file parallelism so
// no other suite can inject a new due row while these tests are running.
beforeAll(async () => {
  const drainSender: CommsSender = { send: async () => ({ ok: true, providerRef: "drain-preexisting-stray-row" }) };
  for (let i = 0; i < 20; i += 1) {
    const { processed } = await processDueMessages(new Date(), drainSender);
    if (processed === 0) break;
  }
});

describe("scheduleMessage", () => {
  it("inserts a PENDING ScheduledMessage row", async () => {
    const phone = freshPhone();
    const msg = await scheduleMessage({
      kind: "CONFIRMATION",
      toPhone: phone,
      locale: "en",
      sendAt: new Date(),
      payload: { bookingId: "b1" },
    });
    expect(msg.status).toBe("PENDING");
    expect(msg.toPhone).toBe(phone);
    expect(msg.sentAt).toBeNull();
  });
});

describe("renderMessageBody", () => {
  it("renders a non-empty string per kind/locale", () => {
    const en = renderMessageBody("CONFIRMATION", "en", { bookingId: "b1" });
    const ar = renderMessageBody("REMINDER_24H", "ar", { bookingId: "b1" });
    const post = renderMessageBody("POST_VISIT", "en", {});
    expect(typeof en).toBe("string");
    expect(en.length).toBeGreaterThan(0);
    expect(typeof ar).toBe("string");
    expect(ar.length).toBeGreaterThan(0);
    expect(post.length).toBeGreaterThan(0);
    // Bilingual: an Arabic-locale render should differ from the English one.
    const enReminder = renderMessageBody("REMINDER_24H", "en", { bookingId: "b1" });
    expect(ar).not.toBe(enReminder);
  });
});

describe("processDueMessages", () => {
  it("sends only due (sendAt<=now) PENDING messages, marks them SENT + logs, and leaves future ones PENDING", async () => {
    const now = new Date();
    const phone = freshPhone();
    const due = await scheduleMessage({
      kind: "CONFIRMATION",
      toPhone: phone,
      locale: "en",
      sendAt: new Date(now.getTime() - 60_000),
      payload: { bookingId: "b-due" },
    });
    const future = await scheduleMessage({
      kind: "REMINDER_24H",
      toPhone: phone,
      locale: "en",
      sendAt: new Date(now.getTime() + 60 * 60_000),
      payload: { bookingId: "b-future" },
    });

    const sent: Array<{ toPhone: string; body: string; channel: string; kind: string }> = [];
    const fakeSender: CommsSender = {
      send: async (msg) => {
        sent.push(msg);
        return { ok: true, providerRef: "fake-ref-1" };
      },
    };

    const result = await processDueMessages(now, fakeSender);
    expect(result.processed).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(sent.length).toBe(1);
    expect(sent[0]!.toPhone).toBe(phone);
    expect(sent[0]!.channel).toBe("whatsapp");

    const updatedDue = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: due.id } });
    expect(updatedDue.status).toBe("SENT");
    expect(updatedDue.sentAt).not.toBeNull();

    const updatedFuture = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: future.id } });
    expect(updatedFuture.status).toBe("PENDING");
    expect(updatedFuture.sentAt).toBeNull();

    const logs = await prisma.communicationLog.findMany({ where: { toPhone: phone } });
    expect(logs.length).toBe(1);
    expect(logs[0]!.status).toBe("SENT");
    expect(logs[0]!.channel).toBe("whatsapp");
    expect(logs[0]!.kind).toBe("CONFIRMATION");
    expect(logs[0]!.body.length).toBeGreaterThan(0);
  });

  it("marks a message FAILED and logs a FAILED CommunicationLog row when the sender reports failure", async () => {
    const now = new Date();
    const phone = freshPhone();
    const msg = await scheduleMessage({
      kind: "POST_VISIT",
      toPhone: phone,
      locale: "en",
      sendAt: new Date(now.getTime() - 1_000),
      payload: {},
    });

    const failingSender: CommsSender = {
      send: async () => ({ ok: false }),
    };

    const result = await processDueMessages(now, failingSender);
    expect(result.processed).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);

    const updated = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.sentAt).toBeNull();

    const logs = await prisma.communicationLog.findMany({ where: { toPhone: phone } });
    expect(logs.length).toBe(1);
    expect(logs[0]!.status).toBe("FAILED");
  });

  it("does not abort the batch when one message's sender call throws", async () => {
    const now = new Date();
    const phoneA = freshPhone();
    const phoneB = freshPhone();
    const throwing = await scheduleMessage({
      kind: "CONFIRMATION",
      toPhone: phoneA,
      locale: "en",
      sendAt: new Date(now.getTime() - 1_000),
      payload: {},
    });
    const okOne = await scheduleMessage({
      kind: "CONFIRMATION",
      toPhone: phoneB,
      locale: "en",
      sendAt: new Date(now.getTime() - 1_000),
      payload: {},
    });

    const flakySender: CommsSender = {
      send: async (msg) => {
        if (msg.toPhone === phoneA) throw new Error("provider exploded");
        return { ok: true, providerRef: "fake-ref-2" };
      },
    };

    const result = await processDueMessages(now, flakySender);
    expect(result.processed).toBe(2);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);

    const updatedThrowing = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: throwing.id } });
    expect(updatedThrowing.status).toBe("FAILED");
    const updatedOk = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: okOne.id } });
    expect(updatedOk.status).toBe("SENT");
  });

  it("re-running processDueMessages does not resend already-SENT messages (idempotency)", async () => {
    const now = new Date();
    const phone = freshPhone();
    await scheduleMessage({
      kind: "CONFIRMATION",
      toPhone: phone,
      locale: "en",
      sendAt: new Date(now.getTime() - 1_000),
      payload: {},
    });

    let callCount = 0;
    const countingSender: CommsSender = {
      send: async () => {
        callCount += 1;
        return { ok: true, providerRef: `ref-${callCount}` };
      },
    };

    const first = await processDueMessages(now, countingSender);
    expect(first.sent).toBe(1);
    const second = await processDueMessages(new Date(now.getTime() + 1000), countingSender);
    expect(second.processed).toBe(0);
    expect(second.sent).toBe(0);
    expect(callCount).toBe(1);

    const logs = await prisma.communicationLog.findMany({ where: { toPhone: phone } });
    expect(logs.length).toBe(1);
  });

  it("defaults to stubSender when no sender is provided, and does not throw", async () => {
    const now = new Date();
    const phone = freshPhone();
    await scheduleMessage({
      kind: "CONFIRMATION",
      toPhone: phone,
      locale: "en",
      sendAt: new Date(now.getTime() - 1_000),
      payload: {},
    });
    const result = await processDueMessages(now);
    expect(result.sent).toBe(1);
    const logs = await prisma.communicationLog.findMany({ where: { toPhone: phone } });
    expect(logs[0]!.providerRef).toMatch(/^stub-/);
  });
});

// Sanity: stubSender itself resolves ok and returns a stub-* providerRef,
// independent of processDueMessages plumbing.
describe("stubSender", () => {
  it("resolves ok:true with a stub-prefixed providerRef", async () => {
    const result = await stubSender.send({ channel: "whatsapp", toPhone: "+15551234567", body: "hi", kind: "CONFIRMATION" });
    expect(result.ok).toBe(true);
    expect(result.providerRef).toMatch(/^stub-/);
  });
});
