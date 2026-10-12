import { test, expect, type Page } from "@playwright/test";

// Ask Lunia (team assistant) end to end, with the built-in engine (no AI key
// locally): numbers, navigation, pre-filled forms, how-to guides, and filing
// an edit request that shows up in the owners' inbox.

async function signInAsOwner(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

async function openAssistant(page: Page) {
  const panel = page.getByTestId("ask-lunia-panel");
  const trigger = page.getByTestId("ask-lunia-trigger");
  await expect(trigger).toBeVisible();
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  await expect(panel).toBeVisible();
  return panel;
}

async function ask(page: Page, question: string) {
  const panel = await openAssistant(page);
  const before = await panel.getByTestId("ask-lunia-message").count();
  await panel.getByTestId("ask-lunia-input").fill(question);
  await panel.getByTestId("ask-lunia-send").click();
  await expect(panel.getByTestId("ask-lunia-message")).toHaveCount(before + 1, { timeout: 15_000 });
  return panel.getByTestId("ask-lunia-message").last();
}

test.beforeEach(async ({ page }) => {
  await signInAsOwner(page);
  // Start every test from an empty chat (history lives in localStorage).
  await page.evaluate(() => {
    localStorage.removeItem("lunia_ask_history");
    sessionStorage.removeItem("lunia_ask_open");
  });
  await page.reload();
});

test("assistant: answers numbers from the database with links", async ({ page }) => {
  const reply = await ask(page, "unpaid invoices");
  await expect(reply.getByTestId("ask-lunia-stats")).toBeVisible();
  await expect(reply.getByTestId("ask-lunia-stats")).toContainText("Outstanding");
  await expect(reply.locator('[data-testid="ask-lunia-link"][data-href^="/admin/billing"]').first()).toBeVisible();

  const revenue = await ask(page, "What was revenue this month?");
  await expect(revenue).toContainText(/SAR/);
});

test("assistant: takes you to a page and keeps the chat across pages", async ({ page }) => {
  await ask(page, "open the calendar");
  await expect(page).toHaveURL(/\/admin\/calendar/);
  // The panel and the conversation survive the navigation.
  const panel = await openAssistant(page);
  await expect(panel.getByTestId("ask-lunia-user-message").first()).toHaveText("open the calendar");

  await ask(page, "افتح الفواتير");
  await expect(page).toHaveURL(/\/admin\/billing/);
});

test("assistant: explains how to do a task step by step", async ({ page }) => {
  const reply = await ask(page, "How do I issue a refund?");
  const guide = reply.getByTestId("ask-lunia-guide");
  await expect(guide).toBeVisible();
  await expect(guide).toContainText("Credit note");
  await expect(guide).toContainText("Issue credit note");
});

test("assistant: opens a pre-filled form (add lead)", async ({ page }) => {
  await ask(page, "add a new lead");
  await expect(page).toHaveURL(/\/admin\/clients/);
  await expect(page.getByTestId("add-lead-form")).toBeVisible();
  // The one-shot ?add=lead is removed so a refresh doesn't reopen it.
  await expect(page).not.toHaveURL(/add=lead/);
});

test("assistant: files an edit request that reaches the owners' inbox", async ({ page }) => {
  const title = `Assistant e2e request ${Date.now()}`;
  await page.goto("/admin/inventory");
  const reply = await ask(page, "I want to request a change");
  await expect(reply).toContainText("describe the change");

  const form = page.getByTestId("ask-lunia-request-form");
  await expect(form).toBeVisible();
  await form.locator('input[name="title"]').fill(title);
  await form.locator('textarea[name="details"]').fill("Please add a supplier phone column to the products list.");
  await form.locator('select[name="priority"]').selectOption("HIGH");
  await page.getByTestId("ask-lunia-request-send").click();
  await expect(page.getByTestId("ask-lunia-messages")).toContainText("Request sent");

  const mine = await ask(page, "my requests");
  await expect(mine).toContainText(title);

  // Owner side: it's in the inbox with the page it was filed from.
  await page.goto("/admin/requests");
  const row = page.getByTestId("edit-request-row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row).toContainText("/admin/inventory");
  await expect(row).toContainText("High priority");

  // Close it with a reply (assistant panel closed first — it floats over the page);
  // the requester then sees the reply in the assistant.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ask-lunia-panel")).toBeHidden();
  await row.getByTestId("request-status-select").selectOption("DONE");
  await row.locator('input[name="resolutionNote"]').fill("Added in the next release");
  await row.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Request updated")).toBeVisible();
  // Done requests leave the default (open) list and show under "Done".
  await expect(row).toBeHidden();
  await page.goto("/admin/requests?status=DONE");
  await expect(page.getByTestId("edit-request-row").filter({ hasText: title })).toBeVisible();

  const after = await ask(page, "my requests");
  await expect(after).toContainText("Done — Added in the next release");
});
