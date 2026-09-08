import type { Metadata } from "next";
import { getEnv } from "@/lib/env";

export type SeoLocale = "ar" | "en";

export interface BuildMetadataInput {
  locale: SeoLocale;
  /** Locale-agnostic path, e.g. "/" or "/about". Must start with "/". */
  path: string;
  titleEn: string;
  titleAr: string;
  descEn: string;
  descAr: string;
  ogImageUrl?: string;
}

function appUrl(): string {
  try {
    return getEnv().APP_URL;
  } catch {
    return "http://localhost:3000";
  }
}

// Builds the root-relative, locale-prefixed path for a given locale + path,
// e.g. localizedPath("en", "/about") -> "/en/about", localizedPath("ar", "/") -> "/ar".
function localizedPath(locale: SeoLocale, path: string): string {
  const normalized = path === "/" ? "" : path;
  return `/${locale}${normalized}`;
}

// Builds a localized Next.js Metadata object for one public page. Pure and
// DB-free: callers resolve the localized copy (titles/descriptions) before
// calling this, so it stays trivially unit-testable.
export function buildMetadata(input: BuildMetadataInput): Metadata {
  const { locale, path, titleEn, titleAr, descEn, descAr, ogImageUrl } = input;
  const title = locale === "ar" ? titleAr : titleEn;
  const description = locale === "ar" ? descAr : descEn;

  const canonical = localizedPath(locale, path);
  const languages: Record<string, string> = {
    "ar-SA": localizedPath("ar", path),
    en: localizedPath("en", path),
    "x-default": localizedPath("ar", path),
  };

  const images = ogImageUrl ? [{ url: ogImageUrl }] : undefined;

  return {
    metadataBase: new URL(appUrl()),
    title,
    description,
    alternates: {
      canonical,
      languages,
    },
    openGraph: {
      title,
      description,
      locale: locale === "ar" ? "ar_SA" : "en_US",
      type: "website",
      url: canonical,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(images ? { images } : {}),
    },
  };
}
