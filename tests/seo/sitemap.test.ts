import { describe, it, expect, vi, beforeEach } from "vitest";

// The catalog reads are mocked per-test so we can simulate a DB outage at
// build time without touching a real database.
vi.mock("@/modules/catalog/services", () => ({ listServices: vi.fn() }));
vi.mock("@/modules/catalog/brands", () => ({ listBrands: vi.fn() }));
vi.mock("@/modules/catalog/journal", () => ({ listPublishedPosts: vi.fn() }));

const STATIC_PATH_COUNT = 7; // home/about/services/brands/results/journal/contact
const LOCALE_COUNT = 2; // ar + en

describe("sitemap resilience", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("still returns all static routes (both locales) when the catalog DB is unreachable", async () => {
    const { listServices } = await import("@/modules/catalog/services");
    const { listBrands } = await import("@/modules/catalog/brands");
    const { listPublishedPosts } = await import("@/modules/catalog/journal");

    vi.mocked(listServices).mockRejectedValue(new Error("DB unreachable"));
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

  it("includes dynamic slugs when the catalog DB is reachable", async () => {
    const { listServices } = await import("@/modules/catalog/services");
    const { listBrands } = await import("@/modules/catalog/brands");
    const { listPublishedPosts } = await import("@/modules/catalog/journal");

    const now = new Date();
    vi.mocked(listServices).mockResolvedValue([
      { slug: "diagnostic-skin-analysis", updatedAt: now } as never,
    ]);
    vi.mocked(listBrands).mockResolvedValue([{ slug: "zo-skin-health", updatedAt: now } as never]);
    vi.mocked(listPublishedPosts).mockResolvedValue([{ slug: "k-beauty-philosophy", updatedAt: now } as never]);

    const sitemap = (await import("@/app/sitemap")).default;
    const entries = await sitemap();

    const urls = entries.map((entry) => entry.url);
    expect(urls.some((url) => url.includes("/services/diagnostic-skin-analysis"))).toBe(true);
    expect(urls.some((url) => url.includes("/brands/zo-skin-health"))).toBe(true);
    expect(urls.some((url) => url.includes("/journal/k-beauty-philosophy"))).toBe(true);
    expect(entries.length).toBe(STATIC_PATH_COUNT * LOCALE_COUNT + 3 * LOCALE_COUNT);
  });
});
