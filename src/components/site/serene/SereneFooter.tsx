import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSetting } from "@/modules/cms/settings";
import { LocaleSwitcher } from "@/components/site/LocaleSwitcher";

interface SereneFooterProps {
  locale: string;
}

const NAV = [
  { key: "about", path: "about" },
  { key: "services", path: "services" },
  { key: "brands", path: "brands" },
  { key: "results", path: "results" },
  { key: "journal", path: "journal" },
  { key: "giftCards", path: "gift-cards" },
  { key: "contact", path: "contact" },
] as const;

// A light, airy Serene-Edition footer: a big medallion + wordmark, a calm
// closing line, a clean link row and contact — a different feel from the main
// site's deep footer, matching the Serene chrome.
export async function SereneFooter({ locale }: SereneFooterProps) {
  const isAr = locale === "ar";
  const [tNav, tFooter, tCommon, business] = await Promise.all([
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "footer" }),
    getTranslations({ locale, namespace: "common" }),
    getSetting("business").catch(() => null),
  ]);
  const year = new Date().getFullYear();
  const businessName = business ? (isAr ? business.nameAr : business.nameEn) : "LUNIA";
  const address = business ? (isAr ? business.addressAr : business.addressEn) : null;

  return (
    <footer className="border-t border-[var(--line)] bg-[var(--color-mist)]">
      {/* Closing CTA */}
      <div data-reveal className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-6 py-[clamp(3.5rem,9svh,6rem)] text-center">
        <span className="srn-medallion !h-14 !w-14"><span aria-hidden="true" className="lunia-emblem !h-7" /></span>
        <h2 data-splittext className="lx-display lx-h2 text-[var(--color-ink)]">{tFooter("tagline")}</h2>
        <Link href={`/${locale}/book`} data-magnetic className="lx-pill px-7 py-3.5 text-[0.95rem]">
          {tCommon("bookNow")}
        </Link>
      </div>

      <div className="border-t border-[var(--line)]">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="flex flex-col gap-3">
            <span className="srn-brand"><span className="srn-medallion"><span aria-hidden="true" className="lunia-emblem" /></span><span role="img" aria-label="LUNIA — Skin & Hair" className="lunia-logo h-5" /></span>
            <p className="max-w-xs text-sm leading-relaxed text-[var(--color-ink)]/65">{businessName}</p>
            {address && <address className="max-w-xs text-sm not-italic leading-relaxed text-[var(--color-ink)]/55">{address}</address>}
          </div>
          <nav aria-label={tFooter("navLabel")} className="flex flex-col gap-2.5">
            {NAV.map((item) => (
              <Link key={item.key} href={`/${locale}/${item.path}`} className="srn-navlink self-start">
                {tNav(item.key)}
              </Link>
            ))}
          </nav>
          <div className="flex flex-col items-start gap-3 text-sm text-[var(--color-ink)]/65">
            {business?.phone && <a href={`tel:${business.phone.replace(/[^\d+]/g, "")}`} dir="ltr" className="srn-navlink">{business.phone}</a>}
            <LocaleSwitcher locale={locale} />
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--line)]">
        <p className="mx-auto max-w-6xl px-6 py-5 text-xs text-[var(--color-ink)]/50">© {year} LUNIA. {tFooter("rights")}</p>
      </div>
    </footer>
  );
}
