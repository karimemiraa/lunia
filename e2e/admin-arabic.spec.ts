import { test, expect, type Page } from "@playwright/test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Staff console in Arabic: switches Display → العربية, opens every admin page
// and fails when visible text is still an English UI string from the admin
// source (a literal that never went through t()). Customer names, notes and
// other data staff typed are never in the source, so they never trip this.

const ADMIN_DIR = join(process.cwd(), "src/app/admin");
const SHARED_DIRS = [ADMIN_DIR, join(process.cwd(), "src/components/admin")];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** English UI literals in the admin source: JSX text and quoted strings with words. */
function englishLiterals(): Set<string> {
  const out = new Set<string>();
  for (const file of SHARED_DIRS.flatMap((d) => walk(d)).filter((f) => /\.tsx?$/.test(f) && !f.includes(`${sep}_i18n${sep}`))) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)(?=[<{])/g)) out.add(m[1]!.trim());
    for (const m of src.matchAll(/}([^<>{}]*[A-Za-z][^<>{}]*)</g)) out.add(m[1]!.trim());
    for (const m of src.matchAll(/["`]([A-Z][A-Za-z'’,.!?&()/ -]{1,80})["`]/g)) out.add(m[1]!.trim());
  }
  // Brand / product words that stay in Latin script by design.
  for (const keep of ["Lunia", "LUNIA", "WhatsApp", "Instagram", "TikTok", "Snapchat", "Moyasar", "ZATCA", "Apple Pay", "mada", "Claude", "VIP", "SKU", "PDF", "CSV", "QR", "SMS", "LED", "IPL", "A4", "OK"]) out.delete(keep);
  for (const s of [...out]) if (s.length < 2 || !/[a-z]/.test(s)) out.delete(s);
  return out;
}

const LITERALS = englishLiterals();

function adminRoutes(): string[] {
  return walk(ADMIN_DIR)
    .filter((f) => f.endsWith(`${sep}page.tsx`) && !f.includes("["))
    .map((f) => "/admin/" + relative(ADMIN_DIR, f).split(sep).slice(0, -1).join("/"))
    .map((r) => r.replace(/\/$/, ""))
    .filter((r) => !r.startsWith("/admin/login") && !r.startsWith("/admin/logout"))
    .sort();
}

async function untranslated(page: Page): Promise<string[]> {
  const chunks = await page.evaluate(() => {
    const out: string[] = [];
    const skip = '[data-i18n-ignore],[aria-hidden="true"],[lang]:not([lang="ar"])';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || ["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "OPTION"].includes(el.tagName) || el.closest(skip)) continue;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") continue;
      const t = n.textContent?.trim();
      if (t) out.push(t);
    }
    for (const el of document.querySelectorAll("[placeholder],[aria-label],[title],option")) {
      if (el.closest(skip)) continue;
      for (const a of ["placeholder", "aria-label", "title"]) {
        const v = el.getAttribute(a);
        if (v) out.push(v.trim());
      }
      if (el.tagName === "OPTION" && el.textContent) out.push(el.textContent.trim());
    }
    return out;
  });
  return [...new Set(chunks.filter((c) => LITERALS.has(c)))];
}

async function signInArabic(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: /Sign in|تسجيل الدخول/ }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.context().addCookies([{ name: "lunia_staff_locale", value: "ar", url: page.url() }]);
}

test.describe("Arabic coverage: staff console", () => {
  test.setTimeout(900_000);

  test("every admin page is Arabic when switched", async ({ page }) => {
    await signInArabic(page);
    const report: Record<string, string[]> = {};
    const routes = (process.env.ADMIN_I18N_ROUTES ?? "").trim() ? process.env.ADMIN_I18N_ROUTES!.split(",") : adminRoutes();
    // Detail pages (/admin/clients/<id>, /admin/billing/<id>, …) are found by
    // following one link of each shape from the pages above.
    const queue = [...routes];
    const seenShapes = new Set<string>();
    const shape = (href: string) => href.replace(/\/[a-z0-9]{20,}(?=\/|$)/g, "/[id]");
    for (let i = 0; i < queue.length; i++) {
      const route = queue[i]!;
      const res = await page.goto(route, { waitUntil: "networkidle" }).catch(() => null);
      if (!res || res.status() >= 400 || !(res.headers()["content-type"] ?? "").includes("text/html")) continue;
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      const left = await untranslated(page);
      if (left.length) report[shape(route)] = left;
      if (process.env.ADMIN_I18N_ROUTES) continue;
      const hrefs = await page.$$eval('a[href^="/admin/"]', (as) => as.map((a) => a.getAttribute("href")!.split("?")[0]!.split("#")[0]!));
      for (const href of hrefs) {
        const s = shape(href);
        if (s === href || seenShapes.has(s) || /export|\/route|print|download|\/documents\/|\/photo\/|\/receipt|\.(csv|pdf)/.test(href)) continue;
        seenShapes.add(s);
        queue.push(href);
      }
    }
    console.log(`Arabic admin coverage: ${queue.length} pages checked (${seenShapes.size} detail-page types: ${[...seenShapes].sort().join(", ")})`);
    if (process.env.ADMIN_I18N_REPORT) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(process.env.ADMIN_I18N_REPORT, JSON.stringify(report, null, 2));
    }
    expect(report, "English UI text on Arabic admin pages").toEqual({});
  });
});
