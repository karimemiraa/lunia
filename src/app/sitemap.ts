import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";
import { routing } from "@/i18n/routing";
import { listDepartments } from "@/modules/catalog/departments";
import { listBrands } from "@/modules/catalog/brands";
import { listPublishedPosts } from "@/modules/catalog/journal";

const STATIC_PATHS = ["/", "/about", "/services", "/brands", "/results", "/journal", "/contact", "/book"];

type SitemapEntry = MetadataRoute.Sitemap[number];

function baseUrl(): string {
  try {
    return getEnv().APP_URL.replace(/\/$/, "");
  } catch {
    return "http://localhost:3000";
  }
}

// Absolute, locale-prefixed URL for a locale-agnostic path, e.g.
// localizedUrl("en", "/about") -> "https://lunia.sa/en/about".
function localizedUrl(locale: string, path: string): string {
  const normalized = path === "/" ? "" : path;
  return `${baseUrl()}/${locale}${normalized}`;
}

// Builds one sitemap entry per locale for a given path, each carrying the
// full hreflang alternates map (ar-SA / en / x-default).
function entriesForPath(path: string, lastModified?: Date): SitemapEntry[] {
  const languages: Record<string, string> = {
    "ar-SA": localizedUrl("ar", path),
    en: localizedUrl("en", path),
    "x-default": localizedUrl("ar", path),
  };

  return routing.locales.map((locale) => ({
    url: localizedUrl(locale, path),
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages },
  }));
}

// Reads the catalog DB for dynamic slugs. If the DB is unreachable at build
// time (e.g. building the production Docker image without a live DB), this
// resolves to an empty array instead of throwing, so the sitemap still ships
// with all the static routes rather than failing the whole build.
async function safeCatalogRead<T>(read: () => Promise<T[]>): Promise<T[]> {
  try {
    return await read();
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [departments, brands, posts] = await Promise.all([
    safeCatalogRead(() => listDepartments({ publishedOnly: true })),
    safeCatalogRead(() => listBrands({ publishedOnly: true })),
    safeCatalogRead(() => listPublishedPosts()),
  ]);

  const entries: SitemapEntry[] = STATIC_PATHS.flatMap((path) => entriesForPath(path));

  // /services/[slug] is keyed by department slug, not individual service slug.
  for (const department of departments) {
    entries.push(...entriesForPath(`/services/${department.slug}`, department.updatedAt));
  }
  for (const brand of brands) {
    entries.push(...entriesForPath(`/brands/${brand.slug}`, brand.updatedAt));
  }
  for (const post of posts) {
    entries.push(...entriesForPath(`/journal/${post.slug}`, post.updatedAt));
  }

  return entries;
}
