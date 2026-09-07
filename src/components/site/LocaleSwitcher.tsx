"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";

type Locale = (typeof routing.locales)[number];

function isLocale(segment: string | undefined): segment is Locale {
  return (routing.locales as readonly string[]).includes(segment ?? "");
}

// Swaps the leading locale segment of `pathname` for `targetLocale`,
// preserving everything after it. `routing.localePrefix` is "always", so a
// well-formed app pathname is always "/<locale>" or "/<locale>/rest/of/path"
// — but this also degrades gracefully (by prepending the locale) if no
// locale segment is present, so a caller never gets back the input
// unchanged.
export function switchLocalePath(pathname: string | null | undefined, targetLocale: string): string {
  const path = pathname && pathname.length > 0 ? pathname : "/";
  if (path === "/") return `/${targetLocale}`;

  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const segments = trimmed.split("/");

  if (isLocale(segments[1])) {
    segments[1] = targetLocale;
  } else {
    segments.splice(1, 0, targetLocale);
  }

  return segments.join("/");
}

interface LocaleSwitcherProps {
  locale: string;
  className?: string;
}

// A plain <a> (not next/link's Link): switching locale swaps the whole
// document — direction, lang, and both font families — so a full
// navigation is the correct behavior here, not a client-side transition.
export function LocaleSwitcher({ locale, className }: LocaleSwitcherProps) {
  const pathname = usePathname();
  const t = useTranslations("common");
  const target: Locale = locale === "ar" ? "en" : "ar";
  const href = switchLocalePath(pathname, target);
  const label = target === "ar" ? t("toArabic") : t("toEnglish");

  return (
    <a
      href={href}
      hrefLang={target}
      lang={target}
      aria-label={t("switchLanguage")}
      className={
        className ??
        "rounded-sm text-sm font-medium tracking-wide text-[var(--color-ink)]/70 underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf7]"
      }
    >
      {label}
    </a>
  );
}
