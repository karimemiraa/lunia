import { describe, it, expect, vi, beforeEach } from "vitest";

// The catalog reads are mocked per-test so we can simulate a DB outage at
// build time without touching a real database.
vi.mock("@/modules/catalog/departments", () => ({ listDepartments: vi.fn() }));
vi.mock("@/modules/catalog/brands", () => ({ listBrands: vi.fn() }));
vi.mock("@/modules/catalog/journal", () => ({ listPublishedPosts: vi.fn() }));

const STATIC_PATH_COUNT = 7; // home/about/services/brands/results/journal/contact
const LOCALE_COUNT = 2; // ar + en

describe("sitemap resilience", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("still returns all static routes (both locales) when the catalog DB is unreachable", async () => {
    const { listDepartments } = await import("@/modules/catalog/departments");
    const { listBrands } = await import("@/modules/catalog/brands");
    const { listPublishedPosts } = await import("@/modules/catalog/journal");

    vi.mocked(listDepartments).mockRejectedValue(new Error("DB unreachable"));
    vi.mocked(listBrands).mockRejectedValue(new Error("DB unreachable"));
    vi.mocked(listPublishedPosts).mockRejectedValue(new Error("DB unreachable"));

    const sitemap = (await import("@/app/sitemap")).default;
    const entries = await sitemap();

    // No dynamic slugs, but every static path survives for both locales.
    expect(entries.length).toBe(STATIC_PATH_COUNT * LOCALE_COUNT);

    const urls = entries.map((entry) => entry.url);
    expect(urls.some((url) => url.endsWith("/en"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/ar"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/en/contact"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/ar/contact"))).toBe(true);
  });

  it("includes dynamic slugs when the catalog DB is reachable, keyed by department (not service) slug", async () => {
    const { listDepartments } = await import("@/modules/catalog/departments");
    const { listBrands } = await import("@/modules/catalog/brands");
    const { listPublishedPosts } = await import("@/modules/catalog/journal");

    const now = new Date();
    // /services/[slug] is keyed by department slug — see
    // src/app/[locale]/(site)/services/[slug]/page.tsx (generateStaticParams
    // uses listDepartments, the page calls getDepartmentBySlug).
    vi.mocked(listDepartments).mockResolvedValue([{ slug: "skin", updatedAt: now } as never]);
    vi.mocked(listBrands).mockResolvedValue([{ slug: "zo-skin-health", updatedAt: now } as never]);
    vi.mocked(listPublishedPosts).mockResolvedValue([{ slug: "k-beauty-philosophy", updatedAt: now } as never]);

    const sitemap = (await import("@/app/sitemap")).default;
    const entries = await sitemap();

    const urls = entries.map((entry) => entry.url);
    expect(urls.some((url) => url.includes("/services/skin"))).toBe(true);
    // A per-service URL would 404 (the route is keyed by department slug).
    expect(urls.some((url) => url.includes("/services/diagnostic-skin-analysis"))).toBe(false);
    expect(urls.some((url) => url.includes("/brands/zo-skin-health"))).toBe(true);
    expect(urls.some((url) => url.includes("/journal/k-beauty-philosophy"))).toBe(true);
    expect(entries.length).toBe(STATIC_PATH_COUNT * LOCALE_COUNT + 3 * LOCALE_COUNT);
  });
});
