import { describe, it, expect } from "vitest";
import { SECTIONS } from "@/app/admin/_i18n/ar";
import { translate } from "@/app/admin/_i18n/t";
import { formatDate, formatRelative } from "@/app/admin/_ui/dates";

// Staff-console Arabic dictionary hygiene (docs/arabic-glossary.md).
describe("staff console Arabic dictionary", () => {
  const entries = Object.entries(SECTIONS).flatMap(([section, dict]) => Object.entries(dict).map(([en, ar]) => ({ section, en, ar })));

  it("every entry is Arabic", () => {
    const notArabic = entries.filter((e) => !/[؀-ۿ]/.test(e.ar) && !/^[A-Z0-9 .+/-]+$/.test(e.ar)).map((e) => `${e.section}: ${e.en}`);
    expect(notArabic).toEqual([]);
  });

  it("keeps every {placeholder} of the English text", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    const broken = entries.filter((e) => vars(e.en) !== vars(e.ar)).map((e) => `${e.section}: ${e.en}`);
    expect(broken).toEqual([]);
  });

  it("never translates the same English text two different ways", () => {
    const seen = new Map<string, { section: string; ar: string }>();
    const conflicts: string[] = [];
    for (const e of entries) {
      const prev = seen.get(e.en);
      if (prev && prev.ar !== e.ar) conflicts.push(`"${e.en}": ${prev.section}=«${prev.ar}» vs ${e.section}=«${e.ar}»`);
      else seen.set(e.en, e);
    }
    expect(conflicts).toEqual([]);
  });

  it("translates with variables and falls back to English", () => {
    expect(translate("Page {page} of {pageCount}", "ar", { page: 2, pageCount: 5 })).toBe("صفحة 2 من 5");
    expect(translate("Some brand-new string", "ar")).toBe("Some brand-new string");
    expect(translate("Save", "en")).toBe("Save");
  });

  it("formats dates in Arabic with the Gregorian calendar and Western digits", () => {
    const d = new Date("2026-10-15T09:00:00Z");
    const ar = formatDate(d, "ar");
    expect(ar).toMatch(/2026/);
    expect(ar).toMatch(/أكتوبر/);
    expect(formatDate(d)).toBe("15 Oct 2026");
    expect(formatRelative(new Date(d.getTime() - 3 * 86_400_000), d, "ar")).toBe("قبل 3 أيام");
  });
});

describe("Ask Lunia in Arabic", () => {
  it("has Arabic for every guide, and every quoted label is a translated UI label", async () => {
    const { GUIDES } = await import("@/modules/staffAssistant/help");
    const { hasArabic } = await import("@/app/admin/_i18n/t");
    const AR = (await import("@/app/admin/_i18n/ar")).default;
    const missing: string[] = [];
    const unresolved = new Set<string>();
    for (const g of GUIDES) {
      for (const s of [g.title, ...g.steps]) {
        if (!hasArabic(s)) missing.push(`${g.id}: ${s}`);
        for (const m of (AR[s] ?? "").matchAll(/\[\[([^\]]+)\]\]/g)) if (!hasArabic(m[1]!)) unresolved.add(m[1]!);
      }
    }
    expect(missing).toEqual([]);
    expect([...unresolved].sort()).toEqual([]);
  });

  it("replies in Arabic with the screens' own labels", async () => {
    const { localizeReply } = await import("@/modules/staffAssistant/localize");
    const { GUIDES, guideToView } = await import("@/modules/staffAssistant/help");
    const g = guideToView(GUIDES.find((x) => x.id === "book-walk-in")!);
    const ar = localizeReply({ text: "Did you mean one of these?", guide: g, source: "rules" }, "ar");
    expect(ar.text).toBe("تقصد واحد من هذي؟");
    expect(ar.guide!.steps.join(" ")).not.toMatch(/\[\[|[A-Za-z]{4,}/);
  });
});
