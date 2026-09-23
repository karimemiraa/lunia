import type { ReactNode } from "react";
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
  { key: "giftCards", path: "gift-cards" },
  { key: "contact", path: "contact" },
] as const;

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]";

const footerLinkClass = `rounded-sm text-sm text-[var(--color-ink)]/70 transition-colors hover:text-[var(--color-ink)] ${focusRingClass}`;
const headingClass = "text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-ink)]/50";

function digitsOnly(value: string): string {
  return value.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function instagramHref(handle: string): string {
  return handle.startsWith("http") ? handle : `https://instagram.com/${handle.replace(/^@/, "")}`;
}

function SocialIcon({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-ink)]/15 text-[var(--color-ink)]/70 transition-colors hover:border-[var(--color-teal)] hover:bg-[var(--color-teal)]/10 hover:text-[var(--color-ink)] ${focusRingClass}`}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        {children}
      </svg>
    </a>
  );
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/wordmark.svg"
            alt="LUNIA — Skin & Hair"
            className="h-11 w-auto self-start"
            width={218}
            height={82}
          />
          <p className="max-w-sm text-sm leading-relaxed text-[var(--color-ink)]/70">{tFooter("tagline")}</p>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className={headingClass}>{tFooter("navHeading")}</h2>
          <nav aria-label={tFooter("navLabel")} className="flex flex-col gap-3">
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
          </div>

          {/* Social + WhatsApp icons, driven by Settings (only shown when set). */}
          <div className="mt-2 flex items-center gap-3">
            {social?.instagram && (
              <SocialIcon href={instagramHref(social.instagram)} label="Instagram">
                <path d="M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s0 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58 0-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.21 15.58 2.2 15.2 2.2 12s0-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.21 8.8 2.2 12 2.2Zm0 3.05A6.75 6.75 0 1 0 18.75 12 6.75 6.75 0 0 0 12 5.25Zm0 11.13A4.38 4.38 0 1 1 16.38 12 4.38 4.38 0 0 1 12 16.38Zm6.9-11.4a1.58 1.58 0 1 1-1.57-1.58 1.58 1.58 0 0 1 1.57 1.58Z" />
              </SocialIcon>
            )}
            {social?.tiktok && (
              <SocialIcon href={social.tiktok.startsWith("http") ? social.tiktok : `https://tiktok.com/@${social.tiktok.replace(/^@/, "")}`} label="TikTok">
                <path d="M16.5 3c.3 2.1 1.5 3.6 3.5 3.9v2.5c-1.3.1-2.5-.2-3.6-.9v6.1a5.6 5.6 0 1 1-5.6-5.6c.3 0 .6 0 .9.1v2.6a3 3 0 1 0 2.1 2.9V3h2.7Z" />
              </SocialIcon>
            )}
            {social?.snapchat && (
              <SocialIcon href={social.snapchat.startsWith("http") ? social.snapchat : `https://snapchat.com/add/${social.snapchat.replace(/^@/, "")}`} label="Snapchat">
                <path d="M12 3c2.3 0 4 1.7 4.1 4 .03.7 0 1.4-.05 2 .5.3 1-.1 1.4-.2.6-.1 1 .7.5 1.1-.4.3-1.2.5-1.6.9-.3.4.2 1 .6 1.6.7 1 1.7 1.5 2.7 1.7.4.1.5.5.2.8-.6.6-1.7.6-2.2 1.1-.2.3-.1.8-.5 1-.5.2-1.2-.2-2-.2-.9 0-1.6.6-2.7.9-.6.2-.9.2-1.5 0-1.1-.3-1.8-.9-2.7-.9-.8 0-1.5.4-2 .2-.4-.2-.3-.7-.5-1-.5-.5-1.6-.5-2.2-1.1-.3-.3-.2-.7.2-.8 1-.2 2-.7 2.7-1.7.4-.6.9-1.2.6-1.6-.4-.4-1.2-.6-1.6-.9-.5-.4-.1-1.2.5-1.1.4.1.9.5 1.4.2-.05-.6-.08-1.3-.05-2C8 4.7 9.7 3 12 3Z" />
              </SocialIcon>
            )}
            {business?.whatsapp && (
              <SocialIcon href={`https://wa.me/${digitsOnly(business.whatsapp)}`} label="WhatsApp">
                <path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.7 4.8-1.3A10 10 0 1 0 12 2Zm5.8 14.2c-.24.68-1.4 1.3-1.94 1.34-.5.05-1.13.24-3.8-.8-3.2-1.26-5.24-4.5-5.4-4.72-.16-.22-1.3-1.73-1.3-3.3 0-1.57.82-2.34 1.1-2.66.28-.32.62-.4.83-.4l.6.01c.2 0 .45-.07.7.54.24.6.83 2.06.9 2.2.07.15.12.32.02.53-.1.22-.15.35-.3.53-.15.18-.32.4-.45.54-.15.15-.3.31-.13.6.17.3.76 1.24 1.63 2.02 1.12 1 2.06 1.3 2.36 1.45.3.15.47.13.64-.08.17-.2.74-.86.94-1.16.2-.3.4-.25.67-.15.27.1 1.7.8 2 .95.28.15.47.22.54.34.07.12.07.72-.17 1.4Z" />
              </SocialIcon>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--color-ink)]/10">
        <div className="mx-auto flex w-full max-w-6xl flex-col-reverse items-center justify-between gap-4 px-6 py-6 text-xs text-[var(--color-ink)]/60 sm:flex-row">
          <p>
            © {year} LUNIA. {tFooter("rights")}
          </p>
          <LocaleSwitcher locale={locale} />
        </div>
      </div>
    </footer>
  );
}
