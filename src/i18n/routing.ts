import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({ locales: ["ar", "en"], defaultLocale: "ar", localePrefix: "always" });
export function localeDirection(locale: string): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
