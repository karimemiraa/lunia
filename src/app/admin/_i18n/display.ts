import "server-only";
import { cookies } from "next/headers";
import { STAFF_LOCALE_COOKIE, STAFF_THEME_COOKIE, parseStaffLocale, parseStaffTheme, type StaffLocale, type StaffTheme } from "./staffLocale";
import { makeT, type T } from "./t";

/** The signed-in staff member's display preferences (language + theme), from cookies. */
export async function getStaffDisplay(): Promise<{ locale: StaffLocale; theme: StaffTheme }> {
  const store = await cookies();
  return {
    locale: parseStaffLocale(store.get(STAFF_LOCALE_COOKIE)?.value),
    theme: parseStaffTheme(store.get(STAFF_THEME_COOKIE)?.value),
  };
}

/** Translator for server components and server actions: const t = await getStaffT(). */
export async function getStaffT(): Promise<T> {
  return makeT((await getStaffDisplay()).locale);
}

/** The staff locale alone (for date/number formatting on the server). */
export async function getStaffLocale(): Promise<StaffLocale> {
  return (await getStaffDisplay()).locale;
}
