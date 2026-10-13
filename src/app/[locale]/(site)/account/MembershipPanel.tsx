import { getTranslations } from "next-intl/server";

export interface MembershipPanelProps {
  locale: "en" | "ar";
  planName: string;
  description: string;
  priceMinor: number;
  status: string;
  serviceDiscountPct: number;
  productDiscountPct: number;
  includedSessions: number;
  periodEnd: Date;
  monthPaid: boolean;
  cancelAt: Date | null;
}

// The customer's paid membership: plan, status, benefits and the current month.
// Payment itself happens through the invoice (My invoices below / pay link).
export async function MembershipPanel(p: MembershipPanelProps) {
  const t = await getTranslations({ locale: p.locale, namespace: "account.membership" });
  const date = (d: Date) => new Intl.DateTimeFormat(p.locale === "ar" ? "ar-SA-u-ca-gregory" : "en-GB", { timeZone: "Asia/Riyadh", day: "numeric", month: "long", year: "numeric" }).format(d);
  const price = new Intl.NumberFormat(p.locale === "ar" ? "ar-SA" : "en-US", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(p.priceMinor / 100);
  const statusKey = (["ACTIVE", "PAST_DUE", "PAUSED"] as const).find((s) => s === p.status) ?? "ACTIVE";
  const benefits = [
    p.serviceDiscountPct > 0 ? t("serviceDiscount", { pct: p.serviceDiscountPct }) : null,
    p.productDiscountPct > 0 ? t("productDiscount", { pct: p.productDiscountPct }) : null,
    p.includedSessions > 0 ? t("includedSessions", { count: p.includedSessions }) : null,
  ].filter((b): b is string => !!b);

  return (
    <section className="lunia-card flex flex-col gap-5 p-6" data-testid="membership-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">{t("heading")}</h2>
          <p className="text-lg text-[var(--color-ink)]">
            {p.planName} · <span className="tabular-nums">{t("perMonth", { price })}</span>
          </p>
        </div>
        <span className="rounded-full bg-[var(--surface-2)] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/80">{t(`status.${statusKey}`)}</span>
      </div>
      {p.description && <p className="text-sm text-[var(--color-ink)]/80">{p.description}</p>}
      {benefits.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm text-[var(--color-ink)]">
          {benefits.map((b) => (
            <li key={b}>• {b}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-[var(--color-ink)]/75">
        {p.monthPaid ? t("paidUntil", { date: date(p.periodEnd) }) : t("unpaid")}
        {p.cancelAt ? ` ${t("endsOn", { date: date(p.cancelAt) })}` : ""}
      </p>
    </section>
  );
}
