import { test, expect, type Page } from "@playwright/test";

// "Everything is Arabic when switched": opens every public page in /ar and
// fails on any visible English word (text, placeholders, aria-labels, titles,
// alt text). Allowed: brand and product names, units/codes in Latin script,
// numbers, emails, URLs and phone numbers. See docs/arabic-glossary.md.

const ALLOWED = new Set(
  [
    // Brand names (always written in Latin)
    "72", "revitalash", "cosmetics", "pca", "skin", "eltamd", "image", "skincare", "edit", "edit.b", "dr", "dr.melaxin", "melaxin", "sungboon", "editor",
    // Technical / product terms written in Latin in Arabic copy
    "led", "lllt", "ipl", "vip", "hydrafacial", "pdf", "a4", "sar", "vat", "qr", "otp", "ab3d", "ef7h", "jk2m", "np9q",
    // Social platforms in links / handles
    "whatsapp", "instagram", "tiktok", "snapchat", "x",
  ].map((w) => w.toLowerCase()),
);

const PUBLIC_PATHS = [
  "/ar",
  "/ar/v2",
  "/ar/v3",
  "/ar/v4",
  "/ar/about",
  "/ar/services",
  "/ar/services/skin",
  "/ar/services/hair-scalp",
  "/ar/services/post-surgery",
  "/ar/brands",
  "/ar/brands/pca-skin",
  "/ar/results",
  "/ar/journal",
  "/ar/journal/the-korean-philosophy-of-skin-quality",
  "/ar/contact",
  "/ar/book",
  "/ar/gift-cards",
  "/ar/account/login",
  "/ar/review/not-a-real-token",
  "/ar/invoice/x_y",
  "/ar/this-page-does-not-exist",
];

/** Latin words visible to an Arabic reader on the current page, minus the allow-list. */
async function englishOnPage(page: Page): Promise<string[]> {
  const chunks = await page.evaluate(() => {
    const out: string[] = [];
    const visible = (el: Element) => {
      const s = getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden" && (el as HTMLElement).offsetParent !== null;
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const parent = n.parentElement;
      if (!parent || ["SCRIPT", "STYLE", "NOSCRIPT", "CODE"].includes(parent.tagName)) continue;
      // Hidden from everyone, or deliberately in another language (the
      // "English" switch carries lang="en").
      if (parent.closest('[data-i18n-ignore],[aria-hidden="true"],[lang]:not([lang="ar"])')) continue;
      if (!visible(parent)) continue;
      const t = n.textContent?.trim();
      if (t) out.push(t);
    }
    for (const el of document.querySelectorAll("[placeholder],[aria-label],[title],img[alt]")) {
      if (el.closest('[data-i18n-ignore],[aria-hidden="true"],[lang]:not([lang="ar"])')) continue;
      for (const a of ["placeholder", "aria-label", "title", "alt"]) {
        const v = el.getAttribute(a);
        if (v) out.push(v);
      }
    }
    out.push(document.title);
    return out;
  });
  const words = new Set<string>();
  for (const raw of chunks) {
    const text = raw
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, " ")
      // Phone numbers, including masked placeholders like +9665XXXXXXXX.
      .replace(/\+?\d[\dXx\s-]{6,}/g, " ");
    for (const w of text.match(/[A-Za-z][A-Za-z.]*[A-Za-z]|[A-Za-z]/g) ?? []) {
      const lw = w.toLowerCase();
      if (ALLOWED.has(lw) || ALLOWED.has(lw.replace(/\.$/, ""))) continue;
      words.add(w);
    }
  }
  return [...words];
}

test.describe("Arabic coverage: public site", () => {
  test.setTimeout(240_000);

  test("every public page is Arabic when switched", async ({ page }) => {
    const report: Record<string, string[]> = {};
    for (const path of PUBLIC_PATHS) {
      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
      const english = await englishOnPage(page);
      if (english.length) report[path] = english;
    }
    expect(report, "English words visible on Arabic pages").toEqual({});
  });
});

// Sunday: the other booking specs own Tue/Wed/Thu (see site-account.spec.ts).
const COVERAGE_WEEKDAY = 0;

test.describe("Arabic coverage: booking flow and customer account", () => {
  test.setTimeout(240_000);

  test("every booking step and account page is Arabic", async ({ page }) => {
    const report: Record<string, string[]> = {};
    const check = async (label: string) => {
      const english = await englishOnPage(page);
      if (english.length) report[label] = english;
    };

    await page.goto("/ar/book");
    await check("book: services");
    await page.locator("button[data-service-id]").first().click();
    await expect(page.getByTestId("booking-step-datetime")).toBeVisible();

    // Farthest open Sunday slot at least 30h out (falls back to any open day).
    const dates = (await page.locator("button[data-date]").evaluateAll((els) => els.map((el) => el.getAttribute("data-date")))).filter(
      (d): d is string => !!d,
    );
    const ordered = [...dates.filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() === COVERAGE_WEEKDAY).reverse(), ...dates];
    let picked = false;
    for (const d of ordered) {
      await page.locator(`button[data-date="${d}"]`).click();
      const slots = page.getByTestId("booking-slots").locator("button[data-slot-time]");
      await Promise.race([
        slots.first().waitFor({ timeout: 10_000 }).catch(() => {}),
        page.getByText(/ما فيه أوقات متاحة/).waitFor({ timeout: 10_000 }).catch(() => {}),
      ]);
      const times = await slots.evaluateAll((els) => els.map((el) => el.getAttribute("data-slot-time")));
      const i = times.findIndex((iso) => iso && new Date(iso).getTime() - Date.now() > 30 * 3_600_000);
      if (i >= 0) {
        await check("book: date & time");
        await slots.nth(i).click();
        picked = true;
        break;
      }
    }
    expect(picked, "an open slot to book").toBe(true);
    await page.getByRole("button", { name: "متابعة" }).click();

    await expect(page.getByTestId("booking-step-contact")).toBeVisible();
    await check("book: your details");
    const phone = `+9665${Date.now().toString().slice(-8)}`;
    await page.getByLabel("الاسم الكامل").fill("عميلة اختبار التعريب");
    await page.getByLabel("رقم الجوال أو الإيميل").fill(phone);
    await page.getByRole("button", { name: "أرسلي رمز التحقق" }).click();
    const devCode = page.getByTestId("dev-otp-code");
    await expect(devCode).toBeVisible({ timeout: 10_000 });
    await check("book: verification code");
    const code = (await devCode.textContent())?.match(/\d{6}/)?.[0];
    await page.getByLabel("رمز التحقق").fill(code!);
    await page.getByRole("button", { name: "تأكيد الحجز" }).click();
    await expect(page.getByTestId("booking-step-success")).toBeVisible({ timeout: 15_000 });
    await check("book: confirmed");

    // Booking signed the customer in: walk the account area.
    for (const path of ["/ar/account", "/ar/account/health"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await check(path);
    }
    await page.goto("/ar/account", { waitUntil: "networkidle" });
    await page.getByTestId("account-booking-details").first().click();
    await expect(page).toHaveURL(/\/ar\/account\/bookings\//);
    await check("/ar/account/bookings/[id]");

    // Clean up: cancel the test booking.
    await page.goto("/ar/account", { waitUntil: "networkidle" });
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "إلغاء الحجز" }).first().click();

    expect(report, "English words visible on Arabic pages").toEqual({});
  });
});
