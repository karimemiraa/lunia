"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STAFF_LOCALE_COOKIE, STAFF_THEME_COOKIE, st, type StaffLocale, type StaffTheme } from "../_i18n/staffLocale";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** Display preferences are plain per-browser cookies (not secrets), written synchronously
 * so the choice survives even an immediate reload; the server reads them on render. */
function writePreference(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

const THEMES: { value: StaffTheme; label: string }[] = [
  { value: "system", label: "Match device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const LANGUAGES: { value: StaffLocale; label: string; lang: string }[] = [
  { value: "en", label: "English", lang: "en" },
  { value: "ar", label: "العربية", lang: "ar" },
];

/** Apply a theme to <html> right away (the cookie + server render follow). */
function applyTheme(theme: StaffTheme) {
  const root = document.documentElement;
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) root.setAttribute("data-theme", "midnight");
  else root.removeAttribute("data-theme");
}

/**
 * Top-bar "Display" control: staff language (English / Arabic RTL) and theme
 * (match device / light / dark), saved per browser in cookies.
 */
export function DisplayMenu({ locale, theme }: { locale: StaffLocale; theme: StaffTheme }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState({ locale, theme });
  const [pending, startTransition] = useTransition();
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const t = (text: string) => st(text, current.locale);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: { locale?: StaffLocale; theme?: StaffTheme }) {
    setCurrent((c) => ({ ...c, ...next }));
    if (next.locale) writePreference(STAFF_LOCALE_COOKIE, next.locale);
    if (next.theme) {
      writePreference(STAFF_THEME_COOKIE, next.theme);
      applyTheme(next.theme);
    }
    // Re-render the server shell (direction, translated chrome, data-theme).
    startTransition(() => router.refresh());
  }

  const option = (selected: boolean) =>
    `flex min-h-10 flex-1 items-center justify-center rounded-[var(--radius-sm)] px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] ${
      selected ? "bg-[var(--color-ink)] font-medium text-[var(--color-on-ink)]" : "text-[var(--color-ink)]/75 hover:bg-[var(--surface-2)]"
    }`;

  return (
    <div ref={root} className="relative" data-testid="display-menu">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t("Display")}
        title={t("Display")}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] text-[var(--color-ink)]/70 transition-colors hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)]"
      >
        {/* Half-filled circle: light/dark + language at a glance. */}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={t("Display")}
          className="absolute end-0 z-50 mt-2 flex w-72 flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)]"
        >
          <fieldset className="flex flex-col gap-2" disabled={pending}>
            <legend className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]/55">{t("Language")}</legend>
            <div className="flex gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-1">
              {LANGUAGES.map((l) => (
                <button key={l.value} type="button" lang={l.lang} aria-pressed={current.locale === l.value} onClick={() => choose({ locale: l.value })} className={option(current.locale === l.value)}>
                  {l.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2" disabled={pending}>
            <legend className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]/55">{t("Theme")}</legend>
            <div className="flex gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-1">
              {THEMES.map((th) => (
                <button key={th.value} type="button" aria-pressed={current.theme === th.value} onClick={() => choose({ theme: th.value })} className={option(current.theme === th.value)}>
                  {t(th.label)}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
