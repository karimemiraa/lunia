import { test, expect } from "@playwright/test";

async function signInAsOwner(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "karim@zealmarketing.net");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("catalog: editing a service's English name via admin updates the public services/department page", async ({
  page,
}) => {
  await signInAsOwner(page);

  await page.goto("/admin/catalog/services");
  await expect(page.getByRole("heading", { name: "Services" })).toBeVisible();

  // Target a known seeded service (see prisma/seed.ts: department "skin" ->
  // service "diagnostic-skin-analysis") via the table's search box.
  await page.getByPlaceholder("Search services...").fill("diagnostic-skin-analysis");
  const row = page.locator("tr", { hasText: "diagnostic-skin-analysis" });
  await expect(row).toBeVisible();

  await row.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: /^Service:/ })).toBeVisible();

  const editUrl = page.url();
  const nameEnInput = page.locator('input[name="name.en"]');
  const originalName = await nameEnInput.inputValue();

  const stamp = Date.now();
  const distinctiveName = `E2E Diagnostic Analysis ${stamp}`;

  try {
    await nameEnInput.fill(distinctiveName);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    // The department detail page renders each published service's English
    // name in an <h3> (see src/app/[locale]/(site)/services/[slug]/page.tsx).
    await page.goto("/en/services/skin");
    await expect(page.getByRole("heading", { name: distinctiveName, level: 3 })).toBeVisible();
  } finally {
    // Restore the original name so re-runs and other suites see stable seed
    // data (mirrors the "self-contained, leaves no lasting change" style of
    // the other admin-* e2e specs).
    await page.goto(editUrl);
    await page.locator('input[name="name.en"]').fill(originalName);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
  }
});

test("catalog: creating a published journal post via admin makes it appear on the public journal page", async ({
  page,
}) => {
  await signInAsOwner(page);

  await page.goto("/admin/catalog/journal");
  await expect(page.getByRole("heading", { name: "Journal", exact: true })).toBeVisible();

  const stamp = Date.now();
  const slug = `e2e-post-${stamp}`;
  const titleEn = `E2E Journal Post ${stamp}`;
  const titleAr = `مقال تجريبي ${stamp}`;

  const createForm = page.getByTestId("create-post-form");
  await createForm.locator('input[name="slug"]').fill(slug);
  await createForm.locator('input[name="title.en"]').fill(titleEn);
  await createForm.locator('input[name="title.ar"]').fill(titleAr);
  await createForm.locator('textarea[name="excerpt.en"]').fill("E2E excerpt.");
  await createForm.locator('textarea[name="excerpt.ar"]').fill("مقتطف تجريبي.");
  await createForm.locator('textarea[name="body.en"]').fill("E2E body content.");
  await createForm.locator('textarea[name="body.ar"]').fill("محتوى تجريبي.");
  await createForm.locator('input[name="isPublished"]').check();
  await createForm.getByRole("button", { name: "Create post" }).click();

  await expect(createForm.getByText("Created.")).toBeVisible();

  try {
    await page.goto("/en/journal");
    await expect(page.getByRole("heading", { name: titleEn, level: 2 })).toBeVisible();
  } finally {
    // Clean up: find the created post in the admin list and delete it.
    await page.goto("/admin/catalog/journal");
    await page.getByPlaceholder("Search posts...").fill(slug);
    const row = page.locator("tr", { hasText: slug });
    await expect(row).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("tr", { hasText: slug })).toHaveCount(0);
  }
});
