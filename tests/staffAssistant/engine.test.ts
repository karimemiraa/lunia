import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";
import { normalize, tokens, matchScore } from "@/modules/staffAssistant/text";
import { periodRange } from "@/modules/staffAssistant/periods";
import { matchDestinations } from "@/modules/staffAssistant/navigation";
import { GUIDES, matchGuides } from "@/modules/staffAssistant/help";
import { answerWithRules, detectPeriod } from "@/modules/staffAssistant/rules";
import type { AssistantViewer } from "@/modules/staffAssistant/types";

const ALL = new Set(Object.values(PERMISSIONS) as PermissionKey[]);
const owner: AssistantViewer = { id: "test-owner", name: "Owner", permissions: ALL };
const frontDesk: AssistantViewer = {
  id: "test-desk",
  name: "Desk",
  permissions: new Set<PermissionKey>([PERMISSIONS.BOOKING_VIEW, PERMISSIONS.BOOKING_MANAGE, PERMISSIONS.CLIENT_VIEW]),
};

describe("text matching", () => {
  it("folds Arabic letter variants, diacritics and the definite article", () => {
    expect(normalize("الفَاتُورَة")).toBe("الفاتوره");
    expect(normalize("إجازة")).toBe("اجازه");
    expect(tokens("الفواتير")).toEqual(["فواتير"]);
    expect(tokens("Open the invoices page")).toEqual(["invoices"]);
  });

  it("scores full and partial matches", () => {
    expect(matchScore("invoices", ["Invoices & payments"])).toBe(1);
    expect(matchScore("invoice", ["invoices"])).toBe(1);
    // whole-phrase hits outrank token-only hits
    expect(matchScore("stock take", ["Stock-take", "stock take"])).toBeGreaterThan(matchScore("stock take", ["Products & stock"]));
    expect(matchScore("payroll", ["Invoices & payments"])).toBe(0);
  });
});

describe("periods (Riyadh time)", () => {
  // 22:30 UTC on Oct 12 is already 01:30 on Oct 13 in Riyadh (UTC+3).
  const now = new Date("2026-10-12T22:30:00Z");

  it("today is the clinic's day, not the server's", () => {
    const r = periodRange("today", now);
    expect(r.from.toISOString()).toBe("2026-10-12T21:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-13T21:00:00.000Z");
  });

  it("this week starts on Sunday; last month is the full previous month", () => {
    // 2026-10-13 is a Tuesday → week starts Sunday 2026-10-11 (Riyadh).
    expect(periodRange("this_week", now).from.toISOString()).toBe("2026-10-10T21:00:00.000Z");
    const lm = periodRange("last_month", now);
    expect(lm.from.toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(lm.to.toISOString()).toBe("2026-09-30T21:00:00.000Z");
  });

  it("detects periods in English and Arabic", () => {
    expect(detectPeriod("revenue last month")).toBe("last_month");
    expect(detectPeriod("ايرادات الشهر الماضي")).toBe("last_month");
    expect(detectPeriod("appointments yesterday")).toBe("yesterday");
    expect(detectPeriod("مواعيد اليوم")).toBe("today");
    expect(detectPeriod("unpaid invoices")).toBeUndefined();
  });
});

describe("navigation", () => {
  it("finds pages in English and Arabic", () => {
    expect(matchDestinations("payroll", owner)[0]?.href).toBe("/admin/hr/payroll");
    expect(matchDestinations("الفواتير", owner)[0]?.href).toBe("/admin/billing");
    expect(matchDestinations("stock take", owner)[0]?.href).toBe("/admin/inventory/stock-take");
  });

  it("never offers a page the viewer's role can't open", () => {
    const hrefs = matchDestinations("payroll salaries", frontDesk).map((d) => d.href);
    expect(hrefs).not.toContain("/admin/hr/payroll");
  });

  it("respects menu items an owner hid", () => {
    const hidden: AssistantViewer = { ...owner, permissions: new Set([...ALL].filter((p) => p !== PERMISSIONS.PLATFORM_MANAGE)), hiddenHrefs: ["/admin/hr/payroll"] };
    expect(matchDestinations("payroll", hidden).map((d) => d.href)).not.toContain("/admin/hr/payroll");
  });
});

// ---- Guides are checked against the real UI -----------------------------------

const ADMIN_DIR = join(process.cwd(), "src/app/admin");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
// Admin screens + shared components + the UI message catalog (e.g. the consent sign form).
const adminSource = [...walk(ADMIN_DIR), ...walk(join(process.cwd(), "src/components")), join(process.cwd(), "src/messages/en.json")]
  .filter((f) => /\.(tsx?|json)$/.test(f))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

function routeExists(href: string): boolean {
  const path = href.split("?")[0]!.replace(/^\/admin\/?/, "");
  return existsSync(join(ADMIN_DIR, path, "page.tsx"));
}

describe("help guides", () => {
  it("have unique ids, steps and keywords", () => {
    const ids = GUIDES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GUIDES) {
      expect(g.steps.length, g.id).toBeGreaterThan(0);
      expect(g.keywords.length, g.id).toBeGreaterThan(0);
    }
  });

  it("only link to admin routes that exist", () => {
    for (const g of GUIDES) for (const l of g.links) expect(routeExists(l.href), `${g.id} → ${l.href}`).toBe(true);
  });

  it("quote button/field labels that really exist in the admin UI", () => {
    const missing: string[] = [];
    for (const g of GUIDES) {
      for (const step of g.steps) {
        for (const m of step.matchAll(/“([^”]+)”/g)) {
          const label = m[1]!;
          if (!adminSource.includes(label)) missing.push(`${g.id}: “${label}”`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("are filtered by permission", () => {
    const deskIds = matchGuides("run payroll", frontDesk).map((m) => m.guide.id);
    expect(deskIds).not.toContain("payroll");
    expect(matchGuides("run payroll", owner)[0]?.guide.id).toBe("payroll");
  });
});

// ---- Built-in engine intents ----------------------------------------------------

describe("rule engine", () => {
  it("navigates on an explicit request (English + Arabic)", async () => {
    expect((await answerWithRules("open payroll", owner)).navigateTo).toBe("/admin/hr/payroll");
    expect((await answerWithRules("افتح الفواتير", owner)).navigateTo).toBe("/admin/billing");
    expect((await answerWithRules("take me to the calendar", frontDesk)).navigateTo).toBe("/admin/calendar");
  });

  it("explains a task with the matching guide (English + Arabic)", async () => {
    expect((await answerWithRules("How do I issue a refund?", owner)).guide?.id).toBe("refund");
    expect((await answerWithRules("كيف أصدر استرداد؟", owner)).guide?.id).toBe("refund");
    expect((await answerWithRules("how do I request leave", frontDesk)).guide?.id).toBe("request-leave");
  });

  it("opens pre-filled forms", async () => {
    const lead = await answerWithRules("add a new lead", owner);
    expect(lead.navigateTo).toBe("/admin/clients?add=lead");
    const book = await answerWithRules("book walk-in", frontDesk);
    expect(book.navigateTo).toBe("/admin/calendar?add=1");
    const inv = await answerWithRules("new invoice", owner);
    expect(inv.navigateTo).toBe("/admin/billing/new");
  });

  it("does not open forms the role can't use", async () => {
    const inv = await answerWithRules("new invoice", frontDesk);
    expect(inv.navigateTo).toBeUndefined();
  });

  it("drafts an edit request", async () => {
    const r = await answerWithRules("I want to request a change", frontDesk);
    expect(r.requestDraft).toBeDefined();
    const ar = await answerWithRules("طلب تعديل", frontDesk);
    expect(ar.requestDraft).toBeDefined();
  });

  it("refuses numbers the role can't see", async () => {
    const r = await answerWithRules("revenue this month", frontDesk);
    expect(r.text).toMatch(/role doesn't include access/);
    expect(r.stats).toBeUndefined();
  });

  it("falls back with suggestions instead of guessing", async () => {
    const r = await answerWithRules("purple elephant quantum", owner);
    expect(r.navigateTo).toBeUndefined();
    expect(r.suggestions?.length).toBeGreaterThan(0);
  });
});

describe("rule engine: staff performance", () => {
  it("routes performance questions to the staff report tool (role-gated)", async () => {
    const r = await answerWithRules("who are the top performers this month?", owner);
    expect(r.links?.map((l) => l.href)).toContain("/admin/reports?type=staff");
    const denied = await answerWithRules("staff performance this month", frontDesk);
    expect(denied.text).toMatch(/role doesn't include access/);
  });
});
