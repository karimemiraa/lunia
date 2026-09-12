"use client";

// The signed-in client's loyalty snapshot: points balance, progress toward
// their next membership tier, and recent ledger activity. Purely
// presentational -- the data comes from getLoyalty (src/modules/crm/loyalty.ts)
// via account/page.tsx, mirroring how NotificationsPanel/AccountBookings
// receive their DTOs from the server page rather than fetching themselves.

import { useTranslations } from "next-intl";

export interface LoyaltyTransactionDTO {
  id: string;
  deltaPoints: number;
  reason: string;
  createdAtIso: string;
}

export interface LoyaltyPanelProps {
  locale: "en" | "ar";
  balance: number;
  currentTierName: string | null;
  currentTierMinPoints: number;
  nextTierName: string | null;
  pointsToNextTier: number | null;
  nextTierMinPoints: number | null;
  transactions: LoyaltyTransactionDTO[];
}

/** Asia/Riyadh is fixed at UTC+3 year-round (no DST) — see availability.ts. */
const CENTER_TZ = "Asia/Riyadh";

function formatDate(iso: string, locale: string): string {
  const intlLocale = locale === "ar" ? "ar-SA" : "en-US";
  return new Intl.DateTimeFormat(intlLocale, { timeZone: CENTER_TZ, dateStyle: "medium" }).format(new Date(iso));
}

function formatPoints(points: number, locale: string): string {
  const intlLocale = locale === "ar" ? "ar-SA" : "en-US";
  return new Intl.NumberFormat(intlLocale).format(points);
}

export function LoyaltyPanel({
  locale,
  balance,
  currentTierName,
  currentTierMinPoints,
  nextTierName,
  pointsToNextTier,
  nextTierMinPoints,
  transactions,
}: LoyaltyPanelProps) {
  const t = useTranslations("account.loyalty");

  const hasNextTier = nextTierName !== null && nextTierMinPoints !== null && pointsToNextTier !== null;
  const progressPct = hasNextTier
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(((balance - currentTierMinPoints) / (nextTierMinPoints! - currentTierMinPoints)) * 100),
        ),
      )
    : 100;

  function reasonLabel(reason: string): string {
    if (reason === "EARN") return t("reasons.EARN");
    if (reason === "REDEEM") return t("reasons.REDEEM");
    if (reason === "TIER") return t("reasons.TIER");
    if (reason === "ADJUST") return t("reasons.ADJUST");
    return reason;
  }

  return (
    <section className="lunia-card flex flex-col gap-6 p-6" data-testid="loyalty-panel">
      <div className="flex flex-col gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">{t("heading")}</h2>
        <p className="text-sm text-[var(--color-ink)]/65">{t("intro")}</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-[var(--color-ink)]/10 bg-[var(--color-cream)]/40 p-5">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
            {t("balanceLabel")}
          </span>
          <span
            className="font-[family-name:var(--font-display)] text-4xl text-[var(--color-ink)]"
            data-testid="loyalty-balance"
          >
            {formatPoints(balance, locale)}
          </span>
          <span className="text-xs text-[var(--color-ink)]/60">{t("pointsUnit")}</span>
        </div>
        {currentTierName && (
          <div className="flex flex-col items-end gap-1 text-end">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
              {t("currentTierLabel")}
            </span>
            <span className="text-lg font-medium text-[var(--color-teal)]" data-testid="loyalty-current-tier">
              {currentTierName}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm text-[var(--color-ink)]/70">
          <span>{hasNextTier ? t("progressToNext", { tier: nextTierName ?? "" }) : t("topTierReached")}</span>
          {hasNextTier && (
            <span data-testid="loyalty-points-to-next">{t("pointsRemaining", { count: pointsToNextTier ?? 0 })}</span>
          )}
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-ink)]/10">
          <div
            className="h-full rounded-full bg-[var(--color-teal)] transition-[width]"
            style={{ width: `${progressPct}%` }}
            data-testid="loyalty-progress-bar"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
          {t("historyHeading")}
        </h3>
        {transactions.length === 0 ? (
          <p className="text-sm text-[var(--color-ink)]/60">{t("emptyHistory")}</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="loyalty-transactions">
            {transactions.map((txn) => (
              <li
                key={txn.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-ink)]/10 px-4 py-2.5 text-sm"
              >
                <div className="flex flex-col">
                  <span className="text-[var(--color-ink)]">{reasonLabel(txn.reason)}</span>
                  <span className="text-xs text-[var(--color-ink)]/55">{formatDate(txn.createdAtIso, locale)}</span>
                </div>
                <span
                  className={
                    txn.deltaPoints > 0
                      ? "font-medium text-[var(--color-teal)]"
                      : txn.deltaPoints < 0
                        ? "font-medium text-red-700"
                        : "font-medium text-[var(--color-ink)]/60"
                  }
                >
                  {txn.deltaPoints > 0 ? "+" : ""}
                  {formatPoints(txn.deltaPoints, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
