import type { MetadataRoute } from "next";
import { getEnv } from "@/lib/env";
import { routing } from "@/i18n/routing";
import { listServices } from "@/modules/catalog/services";
import { listBrands } from "@/modules/catalog/brands";
import { listPublishedPosts } from "@/modules/catalog/journal";

const STATIC_PATHS = ["/", "/about", "/services", "/brands", "/results", "/journal", "/contact"];

type SitemapEntry = MetadataRoute.Sitemap[number];

function baseUrl(): string {
  return getEnv().APP_URL.replace(/\/$/, "");
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
  const [services, brands, posts] = await Promise.all([
    safeCatalogRead(() => listServices(undefined, { publishedOnly: true })),
    safeCatalogRead(() => listBrands({ publishedOnly: true })),
    safeCatalogRead(() => listPublishedPosts()),
  ]);

  const entries: SitemapEntry[] = STATIC_PATHS.flatMap((path) => entriesForPath(path));

  for (const service of services) {
    entries.push(...entriesForPath(`/services/${service.slug}`, service.updatedAt));
  }
  for (const brand of brands) {
    entries.push(...entriesForPath(`/brands/${brand.slug}`, brand.updatedAt));
  }
  for (const post of posts) {
    entries.push(...entriesForPath(`/journal/${post.slug}`, post.updatedAt));
  }

  return entries;
}
