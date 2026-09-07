import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "./LocaleSwitcher";

interface SiteHeaderProps {
  locale: string;
}

const NAV_ITEMS = [
  { key: "home", path: "" },
  { key: "about", path: "about" },
  { key: "services", path: "services" },
  { key: "brands", path: "brands" },
  { key: "results", path: "results" },
  { key: "journal", path: "journal" },
  { key: "contact", path: "contact" },
] as const;

const ctaClass =
  "inline-flex items-center justify-center whitespace-nowrap rounded-full bg-[var(--color-teal)] px-6 py-2.5 text-sm font-medium tracking-wide text-[var(--color-ink)] transition-colors hover:bg-[var(--color-canopy)]";

const navLinkClass =
  "text-sm font-medium tracking-wide text-[var(--color-ink)]/75 transition-colors hover:text-[var(--color-ink)]";

// The public site's chrome header: sticky, translucent-cream, generous
// whitespace. Everything but LocaleSwitcher stays a server component — the
// nav is static per-request copy, and the mobile menu uses a native
// <details>/<summary> disclosure rather than client JS, so it works with
// nothing but HTML semantics (keyboard + screen-reader accessible for free).
export async function SiteHeader({ locale }: SiteHeaderProps) {
  const [tNav, tCommon] = await Promise.all([
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "common" }),
  ]);

  const home = `/${locale}`;
  const contactHref = `/${locale}/contact`;
  const linkHref = (path: string) => (path ? `/${locale}/${path}` : home);

  const navLinks = NAV_ITEMS.map((item) => (
    <Link key={item.key} href={linkHref(item.path)} className={navLinkClass}>
      {tNav(item.key)}
    </Link>
  ));

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-ink)]/10 bg-[var(--color-cream)]/80 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-cream)]/60">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-5">
        <Link
          href={home}
          className="font-[family-name:var(--font-display)] text-2xl font-medium tracking-[0.3em] text-[var(--color-ink)]"
          aria-label={tNav("home")}
        >
          LUNIA
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {navLinks}
        </nav>

        <div className="hidden items-center gap-6 md:flex">
          <LocaleSwitcher locale={locale} />
          <Link href={contactHref} className={ctaClass}>
            {tNav("book")}
          </Link>
        </div>

        <details className="group relative md:hidden">
          <summary
            aria-label={tCommon("menu")}
            className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full text-[var(--color-ink)] transition-colors hover:bg-[var(--color-cream)] [&::-webkit-details-marker]:hidden"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.6">
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </summary>

          <div className="absolute inset-inline-end-0 top-full z-50 mt-3 w-64 rounded-2xl border border-[var(--color-ink)]/10 bg-[var(--color-cream)] p-6 shadow-xl">
            <nav aria-label="Primary" className="flex flex-col gap-4">
              {navLinks}
            </nav>
            <div className="mt-6 flex items-center justify-between border-t border-[var(--color-ink)]/10 pt-6">
              <LocaleSwitcher locale={locale} />
              <Link href={contactHref} className={ctaClass}>
                {tNav("book")}
              </Link>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}
