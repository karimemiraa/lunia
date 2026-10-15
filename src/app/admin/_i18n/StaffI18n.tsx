"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { makeT, type StaffLocale, type T } from "./t";

const LocaleContext = createContext<StaffLocale>("en");

/** Provides the staff locale to client components (set once in the admin layout). */
export function StaffI18nProvider({ locale, children }: { locale: StaffLocale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useStaffLocale(): StaffLocale {
  return useContext(LocaleContext);
}

/** Translator for client components: const t = useStaffT(); t("Save"). */
export function useStaffT(): T {
  const locale = useStaffLocale();
  return useMemo(() => makeT(locale), [locale]);
}

/** Translates a string inside server-rendered markup without threading the locale: <Tr>Save</Tr>. */
export function Tr({ children, vars }: { children: string; vars?: Record<string, string | number> }) {
  return <>{useStaffT()(children, vars)}</>;
}
