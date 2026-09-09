"use client";

// The signed-in client's "My credits" snapshot: gift-card balances issued to
// them, plus prepaid session packages with sessions remaining. Purely
// presentational -- the data comes from listClientCredits
// (src/modules/commerce/packages.ts) via account/page.tsx, mirroring how
// LoyaltyPanel/NotificationsPanel receive their DTOs from the server page
// rather than fetching themselves.

import { useTranslations } from "next-intl";

export interface CreditGiftCardDTO {
  id: string;
  code: string;
  balanceMinor: number;
  currency: string;
  expiresAtIso: string | null;
}

export interface CreditPackageDTO {
  id: string;
  nameEn: string;
  nameAr: string;
  sessionsRemaining: number;
  sessionsTotal: number;
}

export interface MyCreditsPanelProps {
  locale: "en" | "ar";
  giftCards: CreditGiftCardDTO[];
  packages: CreditPackageDTO[];
}

/** Asia/Riyadh is fixed at UTC+3 year-round (no DST) — see availability.ts. */
const CENTER_TZ = "Asia/Riyadh";

function formatDate(iso: string, locale: string): string {
  const intlLocale = locale === "ar" ? "ar-SA" : "en-US";
  return new Intl.DateTimeFormat(intlLocale, { timeZone: CENTER_TZ, dateStyle: "medium" }).format(new Date(iso));
}

function formatMinor(minor: number, currency: string, locale: string): string {
  const intlLocale = locale === "ar" ? "ar-SA" : "en-US";
  return `${new Intl.NumberFormat(intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)} ${currency}`;
}

export function MyCreditsPanel({ locale, giftCards, packages }: MyCreditsPanelProps) {
  const t = useTranslations("account.credits");

  return (
    <section className="lunia-card flex flex-col gap-6 p-6" data-testid="credits-panel">
      <div className="flex flex-col gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">{t("heading")}</h2>
        <p className="text-sm text-[var(--color-ink)]/65">{t("intro")}</p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
          {t("giftCardsHeading")}
        </h3>
        {giftCards.length === 0 ? (
          <p className="text-sm text-[var(--color-ink)]/60" data-testid="credits-empty-giftcards">
            {t("emptyGiftCards")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="credits-giftcards">
            {giftCards.map((card) => (
              <li
                key={card.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-ink)]/10 px-4 py-3 text-sm"
              >
                <div className="flex flex-col">
                  <span className="font-mono text-[var(--color-ink)]">{card.code}</span>
                  {card.expiresAtIso && (
                    <span className="text-xs text-[var(--color-ink)]/55">
                      {t("giftCardExpiry", { date: formatDate(card.expiresAtIso, locale) })}
                    </span>
                  )}
                </div>
                <span className="font-medium text-[var(--color-teal)]">
                  {formatMinor(card.balanceMinor, card.currency, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
          {t("packagesHeading")}
        </h3>
        {packages.length === 0 ? (
          <p className="text-sm text-[var(--color-ink)]/60" data-testid="credits-empty-packages">
            {t("emptyPackages")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="credits-packages">
            {packages.map((pkg) => (
              <li
                key={pkg.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-ink)]/10 px-4 py-3 text-sm"
              >
                <span className="text-[var(--color-ink)]">{locale === "ar" ? pkg.nameAr : pkg.nameEn}</span>
                <span className="font-medium text-[var(--color-teal)]">
                  {t("sessionsRemaining", { remaining: pkg.sessionsRemaining, total: pkg.sessionsTotal })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
