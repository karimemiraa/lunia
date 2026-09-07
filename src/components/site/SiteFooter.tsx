import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSetting } from "@/modules/cms/settings";
import { LocaleSwitcher } from "./LocaleSwitcher";

interface SiteFooterProps {
  locale: string;
}

const NAV_ITEMS = [
  { key: "about", path: "about" },
  { key: "services", path: "services" },
  { key: "brands", path: "brands" },
  { key: "results", path: "results" },
  { key: "journal", path: "journal" },
  { key: "contact", path: "contact" },
] as const;

const footerLinkClass = "text-sm text-[var(--color-ink)]/70 transition-colors hover:text-[var(--color-ink)]";
const headingClass = "text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-ink)]/50";

function digitsOnly(value: string): string {
  return value.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function instagramHref(handle: string): string {
  return handle.startsWith("http") ? handle : `https://instagram.com/${handle.replace(/^@/, "")}`;
}

// Server component: reads NAP + social straight from SiteSetting so the
// footer always reflects what's editable in admin, with no hardcoded
// contact details. Renders gracefully (omitting rows) if settings haven't
// been configured yet.
export async function SiteFooter({ locale }: SiteFooterProps) {
  const isAr = locale === "ar";
  const [tNav, tFooter, business, social] = await Promise.all([
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "footer" }),
    getSetting("business").catch(() => null),
    getSetting("social").catch(() => null),
  ]);

  const year = new Date().getFullYear();
  const businessName = business ? (isAr ? business.nameAr : business.nameEn) : "LUNIA";
  const address = business ? (isAr ? business.addressAr : business.addressEn) : null;

  return (
    <footer className="border-t border-[var(--color-ink)]/10 bg-[var(--color-cream)]/60">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 py-16 sm:py-20 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <span className="font-[family-name:var(--font-display)] text-2xl font-medium tracking-[0.3em] text-[var(--color-ink)]">
            LUNIA
          </span>
          <p className="max-w-sm text-sm leading-relaxed text-[var(--color-ink)]/70">{tFooter("tagline")}</p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className={headingClass}>{tFooter("navHeading")}</h2>
          <nav aria-label="Footer" className="flex flex-col gap-3">
            {NAV_ITEMS.map((item) => (
              <Link key={item.key} href={`/${locale}/${item.path}`} className={footerLinkClass}>
                {tNav(item.key)}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className={headingClass}>{tFooter("contactHeading")}</h2>
          <div className="flex flex-col gap-3 text-sm text-[var(--color-ink)]/70">
            <p className="text-[var(--color-ink)]">{businessName}</p>
            {address && <address className="not-italic leading-relaxed">{address}</address>}
            {business?.phone && (
              <a href={`tel:${digitsOnly(business.phone)}`} className={footerLinkClass}>
                {business.phone}
              </a>
            )}
            {business?.whatsapp && (
              <a
                href={`https://wa.me/${digitsOnly(business.whatsapp)}`}
                target="_blank"
                rel="noreferrer"
                className={footerLinkClass}
              >
                {tFooter("whatsappLabel")}
              </a>
            )}
            {social?.instagram && (
              <a href={instagramHref(social.instagram)} target="_blank" rel="noreferrer" className={footerLinkClass}>
                {tFooter("instagramLabel")}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--color-ink)]/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col-reverse items-center justify-between gap-4 px-6 py-6 text-xs text-[var(--color-ink)]/60 sm:flex-row">
          <p>
            © {year} LUNIA — {tFooter("rights")}
          </p>
          <LocaleSwitcher locale={locale} />
        </div>
      </div>
    </footer>
  );
}
