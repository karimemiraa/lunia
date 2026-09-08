export type Locale = "en" | "ar";

// Picks the locale-appropriate value out of an en/ar pair. Pages hold a
// Department/Service/Brand/BlogPost record (with its xEn/xAr field pairs)
// and use this to project the field they need for the current locale,
// e.g. `localized(locale, department.nameEn, department.nameAr)`.
export function localized<L extends Locale, T>(locale: L, en: T, ar: T): T {
  return locale === "ar" ? ar : en;
}

// Same idea for the Json benefit arrays (Service.benefitsEn/benefitsAr),
// which are stored as `Json` in Prisma and come back as `unknown` — cast to
// string[] here since that's the only shape the seed/admin ever writes.
export function localizedList(locale: Locale, en: unknown, ar: unknown): string[] {
  const value = localized(locale, en, ar);
  return Array.isArray(value) ? (value as string[]) : [];
}
