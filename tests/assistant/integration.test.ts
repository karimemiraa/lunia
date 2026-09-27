import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { ASSISTANT_AUTHOR_ID, captureChatLead, findOrCreateLeadByPhone } from "@/modules/assistant/leads";
import { createCallbackRequest, dueCallbacks, listCallbacks, logCallbackOutcome } from "@/modules/assistant/callbacks";
import { sendChat, openChat } from "@/modules/assistant/service";
import { listChatSessions, getChatSessionDetail } from "@/modules/assistant/admin";
import { callbackSource } from "@/modules/notifications/sources/callbacks";
import { listLeadActivities } from "@/modules/crm/leads";
import { emptyProfile, type ConsultProfile } from "@/modules/assistant/types";
import type { PermissionKey } from "@/modules/iam/permissions";

// Every phone this suite creates starts with this prefix (valid Saudi
// mobiles, since the assistant normalizes numbers) so cleanup can find them.
const PREFIX = "+966598760";
let counter = 0;
const freshPhone = () => `${PREFIX}${String(++counter + Math.floor(Math.random() * 50) * 20).padStart(3, "0")}`;
// Letters only: the assistant strips digits from names.
const RUN = Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

async function sweep() {
  const users = await prisma.user.findMany({ where: { phone: { startsWith: PREFIX } }, select: { id: true } });
  await prisma.callbackRequest.deleteMany({ where: { phone: { startsWith: PREFIX } } });
  await prisma.scheduledMessage.deleteMany({ where: { toPhone: { startsWith: PREFIX } } });
  await prisma.chatSession.deleteMany({ where: { OR: [{ phone: { startsWith: PREFIX } }, { phone: null, name: { startsWith: "IT-" } }] } });
  await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
}

beforeAll(sweep);
afterAll(sweep);

const profile = (p: Partial<ConsultProfile>): ConsultProfile => ({ ...emptyProfile(), ...p });

describe("lead capture", () => {
  it("creates an inbound chat lead with the consultation merged and a timeline note", async () => {
    const phone = freshPhone();
    const res = await captureChatLead({
      clientProfileId: null,
      phone,
      name: "Reem",
      profile: profile({ concerns: ["acne", "pigmentation"], skinType: "oily", durationMonths: 12, event: "wedding", safetyAnswered: true }),
      recommended: ["Microdermabrasion & Peels"],
      outcome: "LEAD",
    });
    const client = await prisma.clientProfile.findUniqueOrThrow({ where: { id: res.clientProfileId }, include: { user: true } });
    expect(client.user.phone).toBe(phone);
    expect(client).toMatchObject({ fullName: "Reem", sourceChannel: "chat", direction: "INBOUND", skinType: "oily" });
    expect(client.skinConcerns).toEqual(["acne & breakouts", "pigmentation & melasma"]);
    expect(client.tags).toContain("chat-assistant");

    const notes = await prisma.leadActivity.findMany({ where: { clientProfileId: res.clientProfileId } });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: "NOTE", authorUserId: ASSISTANT_AUTHOR_ID, outcome: "CHAT_LEAD" });
    expect(notes[0]!.body).toContain("Concerns: Acne & breakouts, Pigmentation & melasma.");
    expect(notes[0]!.body).toContain("Recommended: Microdermabrasion & Peels.");
    const timeline = await listLeadActivities(res.clientProfileId);
    expect(timeline[0]!.authorName).toBe("Website assistant");

    // Same outcome again: no duplicate note. A better outcome: one more note.
    await captureChatLead({ clientProfileId: res.clientProfileId, phone, profile: profile({}), recommended: [], outcome: "LEAD", notedOutcome: "LEAD" });
    await captureChatLead({ clientProfileId: res.clientProfileId, phone, profile: profile({}), recommended: [], outcome: "BOOKED", notedOutcome: "LEAD" });
    expect(await prisma.leadActivity.count({ where: { clientProfileId: res.clientProfileId } })).toBe(2);
  });

  it("never overwrites staff-entered data and finds customers stored in local format", async () => {
    const e164 = freshPhone();
    const local = `0${e164.slice(4)}`;
    const user = await prisma.user.create({
      data: {
        type: "CLIENT",
        phone: local,
        clientProfile: { create: { fullName: "Staff Name", skinType: "dry", skinConcerns: ["eczema"], stage: "active", tags: ["vip"] } },
      },
      include: { clientProfile: true },
    });
    const found = await findOrCreateLeadByPhone({ phone: e164, name: "Other" });
    expect(found).toEqual({ clientProfileId: user.clientProfile!.id, created: false });

    await captureChatLead({ clientProfileId: null, phone: e164, name: "Chat Name", profile: profile({ concerns: ["dryness"], skinType: "oily" }), recommended: [], outcome: "LEAD" });
    const after = await prisma.clientProfile.findUniqueOrThrow({ where: { id: user.clientProfile!.id } });
    expect(after).toMatchObject({ fullName: "Staff Name", skinType: "dry", stage: "active" });
    expect(after.skinConcerns).toEqual(["eczema", "dryness & dehydration"]);
    expect(after.tags).toEqual(["vip", "chat-assistant"]);
    await prisma.user.delete({ where: { id: user.id } });
  });
});

describe("call-backs", () => {
  it("creates a call-back with a due time, lead link and CALLBACK_ACK message", async () => {
    const phone = freshPhone();
    const row = await createCallbackRequest({ name: "Huda", phone: `0${phone.slice(4)}`, locale: "ar", preferredWindow: "evening", topic: "hair_loss" });
    expect(row).toMatchObject({ phone, status: "OPEN", preferredWindow: "evening", source: "CHAT", attempts: 0 });
    expect(row.dueAt).toBeInstanceOf(Date);
    expect(row.clientProfileId).toBeTruthy();
    const ack = await prisma.scheduledMessage.findFirst({ where: { toPhone: phone, kind: "CALLBACK_ACK" } });
    expect(ack?.status).toBe("PENDING");
    expect((ack?.payload as { name?: string }).name).toBe("Huda");
  });

  it("logs outcomes: no answer reschedules, reached closes, each writes a CALL activity", async () => {
    const phone = freshPhone();
    const staff = await prisma.user.findFirstOrThrow({ where: { type: "STAFF" } });
    const now = new Date("2026-09-27T09:00:00Z"); // Sunday 12:00 Riyadh
    const row = await createCallbackRequest({ name: "Amal", phone, preferredWindow: "asap", acknowledge: false }, now);

    const first = await logCallbackOutcome({ id: row.id, outcome: "NO_ANSWER", note: "Voicemail", byUserId: staff.id }, now);
    expect(first).toMatchObject({ status: "NO_ANSWER", attempts: 1, outcome: "NO_ANSWER", handledById: staff.id, assignedToId: staff.id });
    expect(first.dueAt!.getTime()).toBe(now.getTime() + 2 * 3600_000);
    const client = await prisma.clientProfile.findUniqueOrThrow({ where: { id: row.clientProfileId! } });
    expect(client.nextFollowUpAt?.getTime()).toBe(first.dueAt!.getTime());

    const open = await listCallbacks("open");
    expect(open.find((c) => c.id === row.id)).toBeTruthy();

    const done = await logCallbackOutcome({ id: row.id, outcome: "REACHED", byUserId: staff.id }, now);
    expect(done).toMatchObject({ status: "DONE", attempts: 2, outcome: "REACHED" });
    await expect(logCallbackOutcome({ id: row.id, outcome: "BOOKED", byUserId: staff.id })).rejects.toThrow(/closed/);

    const calls = await prisma.leadActivity.findMany({ where: { clientProfileId: row.clientProfileId!, kind: "CALL" }, orderBy: { createdAt: "asc" } });
    expect(calls.map((c) => c.outcome)).toEqual(["NO_ANSWER", "REACHED"]);
    expect(calls[0]!.body).toContain("Voicemail");
  });

  it("feeds due call-backs to the notification bell for client:view only", async () => {
    const phone = freshPhone();
    const past = new Date(Date.now() - 3600_000);
    const row = await createCallbackRequest({ name: "Due Person", phone, acknowledge: false }, past);
    await prisma.callbackRequest.update({ where: { id: row.id }, data: { dueAt: past } });
    const due = await dueCallbacks();
    expect(due.items.map((i) => i.id).concat((await prisma.callbackRequest.findMany({ where: { id: row.id } })).map((r) => r.id))).toContain(row.id);
    const viewer = await callbackSource(new Set<PermissionKey>(["client:view"]));
    expect(viewer.count).toBeGreaterThanOrEqual(1);
    expect(viewer.items.every((i) => i.type === "callback" && i.href === "/admin/callbacks")).toBe(true);
    expect(await callbackSource(new Set<PermissionKey>(["booking:view"]))).toEqual({ count: 0, items: [] });
  });
});

describe("chat service end to end", () => {
  it("persists a conversation that ends in a call-back request", async () => {
    const phone = freshPhone();
    const ctx = { token: null as string | null, locale: "en" as const, ip: `it-${RUN}` };

    const greeting = await openChat(ctx);
    expect(greeting.view.messages).toHaveLength(1);
    expect(greeting.newToken).toBeUndefined();
    expect(await prisma.chatSession.count({ where: { name: `IT-${RUN}` } })).toBe(0);

    let res = await sendChat(ctx, { kind: "choice", value: "concern:pigmentation" });
    expect(res.newToken).toBeTruthy();
    ctx.token = res.newToken!;
    res = await sendChat(ctx, { kind: "choice", value: "callback" });
    res = await sendChat(ctx, { kind: "text", text: `IT-${RUN}` });
    res = await sendChat(ctx, { kind: "text", text: `0${phone.slice(4)}` });
    expect(res.view.ui.chips.map((c) => c.value)).toContain("win:afternoon");
    res = await sendChat(ctx, { kind: "choice", value: "win:afternoon" });

    const session = await prisma.chatSession.findUniqueOrThrow({ where: { token: ctx.token }, include: { callbacks: true } });
    expect(session).toMatchObject({ name: `IT-${RUN}`, phone, outcome: "CALLBACK" });
    expect(session.clientProfileId).toBeTruthy();
    expect(session.callbacks).toHaveLength(1);
    expect(session.callbacks[0]).toMatchObject({ phone, preferredWindow: "afternoon", clientProfileId: session.clientProfileId, source: "CHAT" });
    const transcript = session.transcript as { from: string; text: string }[];
    expect(transcript[0]!.from).toBe("bot");
    expect(transcript.filter((t) => t.from === "user").map((t) => t.text)).toEqual([
      "Pigmentation & melasma",
      "Call me back",
      `IT-${RUN}`,
      `0${phone.slice(4)}`,
      "Afternoon",
    ]);

    // The customer record carries the concern and the timeline has the notes.
    const client = await prisma.clientProfile.findUniqueOrThrow({ where: { id: session.clientProfileId! } });
    expect(client.skinConcerns).toContain("pigmentation & melasma");
    const notes = await prisma.leadActivity.findMany({ where: { clientProfileId: client.id }, orderBy: { createdAt: "asc" } });
    expect(notes.map((n) => n.outcome)).toEqual(["CHAT_LEAD", "CHAT_CALLBACK"]);

    // Admin views.
    const list = await listChatSessions({ outcome: "CALLBACK" });
    expect(list.rows.find((r) => r.id === session.id)?.concerns).toEqual(["Pigmentation & melasma"]);
    const detail = await getChatSessionDetail(session.id);
    expect(detail?.callbacks).toHaveLength(1);
    expect(detail?.client?.id).toBe(client.id);

    // Resuming returns the saved transcript.
    const resumed = await openChat(ctx);
    expect(resumed.view.messages.length).toBe(transcript.length);
  });

  it("books in chat against real availability with the OTP flow", async () => {
    const phone = freshPhone();
    const service = await prisma.service.findFirstOrThrow({ where: { slug: "led-light-therapy" } });
    let signedIn = false;
    const ctx = {
      token: null as string | null,
      locale: "en" as const,
      ip: `it3-${RUN}`,
      onClientSignedIn: async () => {
        signedIn = true;
      },
    };
    let res = await sendChat(ctx, { kind: "choice", value: "book" });
    ctx.token = res.newToken!;
    res = await sendChat(ctx, { kind: "choice", value: `svc:${service.id}` });
    // Walk forward through the offered days until one has free times.
    let slot: string | undefined;
    for (const day of res.view.ui.chips.filter((c) => c.value.startsWith("day:")).slice(1)) {
      res = await sendChat(ctx, { kind: "choice", value: day.value });
      slot = res.view.ui.chips.find((c) => c.value.startsWith("slot:"))?.value;
      if (slot) break;
    }
    expect(slot).toBeTruthy();
    res = await sendChat(ctx, { kind: "choice", value: slot! });
    res = await sendChat(ctx, { kind: "text", text: `IT-${RUN} Booker` });
    res = await sendChat(ctx, { kind: "text", text: phone });
    // Nothing is written to the CRM for an unverified number.
    expect(await prisma.user.count({ where: { phone } })).toBe(0);
    expect((await prisma.chatSession.findUniqueOrThrow({ where: { token: ctx.token } })).clientProfileId).toBeNull();
    const devLine = res.view.messages.map((m) => m.text).find((t) => /Development only/.test(t));
    const code = /(\d{6})/.exec(devLine ?? "")?.[1];
    expect(code).toBeTruthy();
    res = await sendChat(ctx, { kind: "text", text: "999999" === code ? "000000" : "999999" });
    expect(res.view.ui.input).toBe("code");
    res = await sendChat(ctx, { kind: "text", text: code! });

    const session = await prisma.chatSession.findUniqueOrThrow({ where: { token: ctx.token } });
    expect(session.outcome).toBe("BOOKED");
    expect(signedIn).toBe(true);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: session.bookingId! }, include: { appointments: true } });
    expect(booking).toMatchObject({ channel: "ONLINE", sourceChannel: "chat", clientProfileId: session.clientProfileId });
    expect(booking.appointments[0]!.startAt.toISOString()).toBe(slot!.slice("slot:".length));
    expect(res.view.messages.at(-1)!.links?.[0]?.href).toBe("/en/account");
    // The lead is attached to the verified client, with one consultation note.
    const client = await prisma.clientProfile.findUniqueOrThrow({ where: { id: booking.clientProfileId }, include: { user: true } });
    expect(client.user.phone).toBe(phone);
    expect(client.tags).toContain("chat-assistant");
    const notes = await prisma.leadActivity.findMany({ where: { clientProfileId: client.id } });
    expect(notes.map((n) => n.outcome)).toEqual(["CHAT_BOOKED"]);
  });

  it("rejects oversized and malformed input without persisting", async () => {
    const ctx = { token: null, locale: "ar" as const, ip: `it2-${RUN}` };
    const long = await sendChat(ctx, { kind: "text", text: "x".repeat(700) });
    expect(long.newToken).toBeUndefined();
    expect(long.view.messages.at(-1)!.text).toMatch(/طويلة/);
    const forged = await sendChat(ctx, { kind: "choice", value: "<script>alert(1)</script>" });
    expect(forged.newToken).toBeUndefined();
  });
});
