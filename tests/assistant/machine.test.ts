import { describe, it, expect, vi } from "vitest";
import { advance, newSession, type AssistantPorts, type Input, type Session } from "@/modules/assistant/machine";
import { ruleEngine } from "@/modules/assistant/nlu/rules";
import { CATALOG, HOURS } from "./fixtures";

// Sunday 2026-09-27, 12:00 in Riyadh.
const NOW = new Date("2026-09-27T09:00:00Z");

function fakePorts(overrides: Partial<AssistantPorts> = {}): AssistantPorts & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { getSlots: [], sendOtp: [], book: [], requestCallback: [], captureLead: [] };
  return {
    now: NOW,
    catalog: CATALOG,
    hours: HOURS,
    business: {
      nameEn: "Lunia",
      nameAr: "لونيا",
      addressEn: "King Fahd Road, Riyadh",
      addressAr: "طريق الملك فهد، الرياض",
      phone: "+966500000000",
      whatsapp: "+966 50 000 0000",
      email: "hello@lunia.test",
    },
    nlu: ruleEngine,
    async getSlots(serviceId, dateISO) {
      calls.getSlots!.push({ serviceId, dateISO });
      return ["2026-09-28T13:00:00.000Z", "2026-09-28T14:00:00.000Z"];
    },
    async sendOtp(phone) {
      calls.sendOtp!.push(phone);
      return { ok: true, devCode: "123456" };
    },
    async book(input) {
      calls.book!.push(input);
      return input.code === "123456"
        ? { ok: true, bookingId: "bk_test_000001", startAt: input.startAt, priceMinor: 50000 }
        : { ok: false, reason: "code" };
    },
    async requestCallback(input) {
      calls.requestCallback!.push(input);
      return { ok: true, dueAt: new Date(NOW.getTime() + 5 * 3600_000) };
    },
    async captureLead(s) {
      calls.captureLead!.push({ phone: s.phone, outcome: s.outcome });
    },
    ...overrides,
    calls,
  };
}

async function run(session: Session, ports: AssistantPorts, ...inputs: (string | Input)[]) {
  let s = session;
  let last = { replies: [] as { text: string }[], userText: "" };
  for (const input of inputs) {
    const res = await advance(s, typeof input === "string" ? { kind: "text", text: input } : input, ports);
    s = res.session;
    last = res;
  }
  return { session: s, ...last };
}

const choice = (value: string): Input => ({ kind: "choice", value });
const chipValues = (s: Session) => s.flow.chips.map((c) => c.value);

describe("assistant state machine", () => {
  it("starts on the concern question with concern chips and escape hatches", () => {
    const s = newSession("ar");
    expect(s.state).toBe("ask_concern");
    expect(chipValues(s)).toEqual(expect.arrayContaining(["concern:acne", "concern:hair_loss", "book", "faq", "callback"]));
  });

  it("walks the intake with chips and ends in a recommendation", async () => {
    const ports = fakePorts();
    let r = await run(newSession("en"), ports, choice("concern:acne"));
    expect(r.session.state).toBe("ask_duration");
    r = await run(r.session, ports, choice("dur:long"), choice("tried:home"), choice("goal:clear_skin"), choice("skin:oily"));
    expect(r.session.state).toBe("ask_safety");
    r = await run(r.session, ports, choice("safety:none"));
    expect(r.session.state).toBe("recommend");
    expect(r.session.flow.asked.length).toBeLessThanOrEqual(6);
    const cards = (r.replies as { cards?: { name: string }[] }[]).flatMap((x) => x.cards ?? []);
    expect(cards.map((c) => c.name)).toContain("Microdermabrasion & Peels");
    expect(chipValues(r.session)).toContain("book:svc-microdermabrasion-peels");
    expect(r.session.profile).toMatchObject({ concerns: ["acne"], durationMonths: 18, skinType: "oily", safetyAnswered: true });
  });

  it("fills several answers from one free-text message and skips those questions", async () => {
    const ports = fakePorts();
    const r = await run(newSession("ar"), ports, "عندي حبوب وتصبغات من سنة وأبغى بشرتي تصفى قبل زواجي");
    expect(r.session.profile.concerns).toEqual(["acne", "pigmentation"]);
    expect(r.session.profile.durationMonths).toBe(12);
    expect(r.session.profile.event).toBe("wedding");
    // Duration and goal are known, so the next question is "what have you tried".
    expect(r.session.state).toBe("ask_tried");
  });

  it("lets every question be skipped", async () => {
    const ports = fakePorts();
    const r = await run(newSession("en"), ports, choice("concern:hair_loss"), choice("skip"), choice("skip"), choice("skip"), choice("skip"));
    expect(r.session.state).toBe("recommend");
    expect(r.session.recommendedServiceIds[0]).toBe("svc-led-lllt-cap-therapy");
  });

  it("answers an FAQ mid-intake and returns to the same question", async () => {
    const ports = fakePorts();
    let r = await run(newSession("en"), ports, choice("concern:dryness"));
    expect(r.session.state).toBe("ask_duration");
    r = await run(r.session, ports, "what are your opening hours?");
    expect(r.replies[0]!.text).toMatch(/open now/i);
    expect(r.replies.at(-1)!.text).toMatch(/how long/i);
    expect(r.session.state).toBe("ask_duration");
  });

  it("goes careful on pregnancy: no booking, call-back first", async () => {
    const ports = fakePorts();
    let r = await run(newSession("ar"), ports, "عندي كلف وانا حامل");
    // Safety is already answered by the message; intake continues without asking it.
    r = await run(r.session, ports, choice("skip"), choice("skip"), choice("skip"), choice("skip"));
    expect(r.session.state).toBe("recommend");
    expect(chipValues(r.session)[0]).toBe("callback");
    expect(chipValues(r.session).some((v) => v.startsWith("book:"))).toBe(false);
    r = await run(r.session, ports, choice("book"));
    expect(r.session.state).toBe("menu");
    expect(chipValues(r.session)[0]).toBe("callback");
  });

  it("books in chat: service, day, slot, name, phone, OTP", async () => {
    const ports = fakePorts();
    let r = await run(newSession("en"), ports, choice("book"));
    expect(r.session.state).toBe("book_service");
    // In-center-only services are not offered for online booking.
    expect(chipValues(r.session)).not.toContain("svc:svc-pressotherapy");
    r = await run(r.session, ports, choice("svc:svc-microdermabrasion-peels"));
    expect(r.session.state).toBe("book_day");
    expect(chipValues(r.session)).not.toContain("day:2026-10-02"); // Friday closed
    r = await run(r.session, ports, choice("day:2026-09-28"));
    expect(r.session.state).toBe("book_slot");
    r = await run(r.session, ports, choice("slot:2026-09-28T13:00:00.000Z"));
    expect(r.session.state).toBe("book_name");
    r = await run(r.session, ports, "Sara Ahmed");
    expect(r.session.state).toBe("book_phone");
    r = await run(r.session, ports, "055 123 4567");
    expect(r.session.state).toBe("book_otp");
    expect(ports.calls.sendOtp).toEqual(["+966551234567"]);
    expect(ports.calls.captureLead).toHaveLength(1);
    r = await run(r.session, ports, "000000");
    expect(r.session.state).toBe("book_otp");
    r = await run(r.session, ports, "123456");
    expect(r.session.outcome).toBe("BOOKED");
    expect(r.session.bookingId).toBe("bk_test_000001");
    const summary = (r.replies as { summary?: unknown; links?: { href: string }[] }[]).find((x) => x.summary);
    expect(summary?.links?.[0]?.href).toBe("/en/account");
    expect(ports.calls.book).toHaveLength(2);
  });

  it("refuses stale or forged slots and services it did not offer", async () => {
    const ports = fakePorts();
    // In-center-only services are never offered, and a forged pick is ignored.
    let r = await run(newSession("en"), ports, choice("book"), choice("svc:svc-pressotherapy"));
    expect(r.session.state).toBe("book_service");
    expect(r.session.flow.bookServiceId).toBeUndefined();
    // Recommended-but-in-center services route to a call-back.
    r = await run(newSession("en"), ports, choice("concern:post_surgery"), choice("skip"), choice("skip"), choice("skip"));
    expect(r.session.state).toBe("recommend");
    expect(chipValues(r.session).some((v) => v.startsWith("book:"))).toBe(false);
    r = await run(r.session, ports, choice("book:svc-pressotherapy"));
    expect(r.session.state).toBe("menu");
    expect(chipValues(r.session)[0]).toBe("callback");
    r = await run(newSession("en"), ports, choice("book"), choice("svc:svc-led-light-therapy"), choice("day:2026-09-28"));
    r = await run(r.session, ports, choice("slot:2030-01-01T00:00:00.000Z"));
    expect(r.session.state).toBe("book_slot");
    expect(r.session.flow.slotAt).toBeUndefined();
    r = await run(r.session, ports, choice("day:1999-01-01"));
    expect(r.session.state).toBe("book_slot");
    expect(ports.calls.getSlots).toHaveLength(1);
  });

  it("handles a slot that was just taken", async () => {
    const ports = fakePorts({ book: vi.fn(async () => ({ ok: false as const, reason: "taken" as const })) });
    let r = await run(newSession("en"), ports, choice("book"), choice("svc:svc-led-light-therapy"), choice("day:2026-09-28"));
    r = await run(r.session, ports, choice("slot:2026-09-28T13:00:00.000Z"), "Mona", "0551234567", "123456");
    expect(r.session.state).toBe("book_slot");
    expect(r.session.outcome).toBe("LEAD");
  });

  it("requests a call-back and captures the lead", async () => {
    const ports = fakePorts();
    let r = await run(newSession("ar"), ports, "ابي اكلم احد");
    expect(r.session.state).toBe("cb_name");
    r = await run(r.session, ports, "نورة");
    expect(r.session.state).toBe("cb_phone");
    r = await run(r.session, ports, "٠٥٥١٢٣٤٥٦٧");
    expect(r.session.state).toBe("cb_window");
    r = await run(r.session, ports, choice("win:evening"));
    expect(r.session.outcome).toBe("CALLBACK");
    expect(ports.calls.requestCallback).toHaveLength(1);
    expect(ports.calls.requestCallback![0]).toMatchObject({ name: "نورة", phone: "+966551234567", window: "evening" });
    expect(ports.calls.captureLead!.at(-1)).toMatchObject({ outcome: "CALLBACK" });
  });

  it("uses a phone given in free text without asking again", async () => {
    const ports = fakePorts();
    let r = await run(newSession("en"), ports, "my name is Layla, call me on 0551234567");
    expect(r.session.name).toBe("Layla");
    expect(r.session.phone).toBe("+966551234567");
    expect(r.session.state).toBe("cb_window");
    r = await run(r.session, ports, choice("win:asap"));
    expect(r.session.outcome).toBe("CALLBACK");
  });

  it("builds a prefilled WhatsApp link with the profile", async () => {
    const ports = fakePorts();
    const r = await run(newSession("en"), ports, choice("concern:pigmentation"), choice("whatsapp"));
    const link = (r.replies as { links?: { href: string }[] }[]).flatMap((x) => x.links ?? [])[0]!;
    expect(link.href).toMatch(/^https:\/\/wa\.me\/966500000000\?text=/);
    expect(decodeURIComponent(link.href)).toContain("Pigmentation");
    expect(r.session.outcome).toBe("WHATSAPP");
  });

  it("ignores chips that were never offered", async () => {
    const ports = fakePorts();
    const r = await run(newSession("en"), ports, choice("win:asap"));
    expect(r.session.state).toBe("ask_concern");
    expect(ports.calls.requestCallback).toHaveLength(0);
  });

  it("answers FAQs from settings and catalog", async () => {
    const ports = fakePorts();
    let r = await run(newSession("en"), ports, choice("faq"), choice("faq:prices"));
    expect(r.replies[0]!.text).toMatch(/SAR/);
    expect(r.session.state).toBe("faq_menu");
    r = await run(r.session, ports, choice("faq:duration"));
    expect(r.replies[0]!.text).toMatch(/between 30 and 90 minutes/);
    r = await run(r.session, ports, choice("back"));
    expect(r.session.state).toBe("ask_concern");
  });
});
