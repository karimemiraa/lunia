import { describe, it, expect } from "vitest";
import { recommendServices, needsCareful } from "@/modules/assistant/recommend";
import { emptyProfile, type ConsultProfile } from "@/modules/assistant/types";
import { callbackDueAt, nextAttemptAt, openDays, openState } from "@/modules/assistant/hours";
import { CATALOG, HOURS } from "./fixtures";

const profile = (p: Partial<ConsultProfile>): ConsultProfile => ({ ...emptyProfile(), ...p });
const slugs = (p: Partial<ConsultProfile>) => recommendServices(profile(p), CATALOG).items.map((i) => i.service.slug);

describe("recommendServices", () => {
  it("maps skin concerns to real treatments plus the skin analysis", () => {
    const acne = slugs({ concerns: ["acne"], areas: ["face"] });
    expect(acne[0]).toBe("microdermabrasion-peels");
    expect(acne).toContain("diagnostic-skin-analysis");
    expect(acne.length).toBeLessThanOrEqual(3);

    expect(slugs({ concerns: ["dryness"] })[0]).toBe("signature-facials-hydrafacial");
    expect(slugs({ concerns: ["sensitivity"] })[0]).toBe("led-light-therapy");
  });

  it("maps hair concerns within the hair department", () => {
    const loss = slugs({ concerns: ["hair_loss"] });
    expect(loss[0]).toBe("led-lllt-cap-therapy");
    expect(loss).toContain("scalp-diagnostic-analysis");
    expect(slugs({ concerns: ["dandruff"] })[0]).toBe("scalp-detox");
  });

  it("recommends post-surgery services (no diagnostic in that department)", () => {
    const res = recommendServices(profile({ concerns: ["post_surgery"] }), CATALOG);
    expect(res.items.map((i) => i.service.slug)).toEqual(["manual-lymphatic-drainage", "pressotherapy", "compression-garment-guidance"]);
    expect(res.careful).toBe(false);
  });

  it("starts with a diagnostic analysis when unsure", () => {
    expect(slugs({})).toEqual(["diagnostic-skin-analysis"]);
    expect(slugs({ areas: ["scalp"] })).toEqual(["scalp-diagnostic-analysis"]);
    // Many concerns / long history -> diagnostic first.
    const many = recommendServices(profile({ concerns: ["acne", "pigmentation", "pores"] }), CATALOG);
    expect(many.unsure).toBe(true);
    expect(many.items[0]!.service.slug).toBe("diagnostic-skin-analysis");
  });

  it("covers both domains for mixed skin + hair concerns", () => {
    const mixed = slugs({ concerns: ["pigmentation", "hair_loss"] });
    expect(mixed).toContain("microdermabrasion-peels");
    expect(mixed).toContain("led-lllt-cap-therapy");
  });

  it("switches to consultation-only when a safety flag is set", () => {
    const res = recommendServices(profile({ concerns: ["acne"], contraindications: ["pregnant"] }), CATALOG);
    expect(res.careful).toBe(true);
    expect(res.items.map((i) => i.service.slug)).toEqual(["diagnostic-skin-analysis"]);
    // Post-surgery + pregnancy: no treatment is suggested at all.
    expect(recommendServices(profile({ concerns: ["post_surgery"], contraindications: ["breastfeeding"] }), CATALOG).items).toEqual([]);
    // A recent procedure is expected for post-surgery care.
    expect(needsCareful(profile({ concerns: ["post_surgery"], contraindications: ["recent_procedure"] }))).toBe(false);
    expect(needsCareful(profile({ concerns: ["acne"], contraindications: ["allergies"] }))).toBe(false);
  });

  it("never hardcodes ids (works with renamed ids)", () => {
    const renamed = CATALOG.map((s) => ({ ...s, id: `x-${s.slug}` }));
    expect(recommendServices(profile({ concerns: ["acne"] }), renamed).items[0]!.service.id).toBe("x-microdermabrasion-peels");
  });
});

describe("hours", () => {
  // 2026-09-27 is a Sunday. Riyadh = UTC+3.
  const at = (iso: string) => new Date(iso);

  it("knows when the center is open", () => {
    expect(openState(HOURS, at("2026-09-27T12:00:00Z"))).toEqual({ open: true, closesAt: "22:00" });
    const late = openState(HOURS, at("2026-09-27T20:00:00Z")); // 23:00 local
    expect(late.open).toBe(false);
    expect(late.nextOpen).toMatchObject({ dateISO: "2026-09-28", time: "10:00", daysAhead: 1 });
    // Thursday night -> Friday closed -> Saturday.
    expect(openState(HOURS, at("2026-10-01T20:00:00Z")).nextOpen).toMatchObject({ dateISO: "2026-10-03", dayKey: "sat" });
  });

  it("lists bookable days skipping closed ones", () => {
    const days = openDays(HOURS, at("2026-09-27T06:00:00Z"), 7);
    expect(days).toHaveLength(7);
    expect(days).not.toContain("2026-10-02"); // Friday
    expect(days[0]).toBe("2026-09-27");
  });

  it("schedules call-backs inside the requested window and opening hours", () => {
    const sundayNoon = at("2026-09-27T09:00:00Z"); // 12:00 local
    expect(callbackDueAt(HOURS, "asap", sundayNoon)).toEqual(sundayNoon);
    expect(callbackDueAt(HOURS, "evening", sundayNoon).toISOString()).toBe("2026-09-27T14:00:00.000Z"); // 17:00 local
    expect(callbackDueAt(HOURS, "morning", sundayNoon).toISOString()).toBe("2026-09-28T07:00:00.000Z"); // next day 10:00
    const thursdayLate = at("2026-10-01T20:00:00Z");
    expect(callbackDueAt(HOURS, "asap", thursdayLate).toISOString()).toBe("2026-10-03T07:00:00.000Z"); // Saturday 10:00
    expect(nextAttemptAt(HOURS, sundayNoon, 1).toISOString()).toBe("2026-09-27T11:00:00.000Z");
  });
});
