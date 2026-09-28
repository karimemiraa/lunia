// The signed-in client's issued invoices and credit notes, each linking to
// its tokenized printable view (/[locale]/invoice/<token>). Server component:
// tokens are signed with the server secret, so they're built here.

import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { invoiceToken } from "@/modules/billing/token";
import { formatAmount } from "@/modules/billing/money";

const CENTER_TZ = "Asia/Riyadh";

export async function MyInvoicesPanel({ locale, clientProfileId }: { locale: "ar" | "en"; clientProfileId: string }) {
  const t = await getTranslations({ locale, namespace: "invoices.account" });
  const invoices = await prisma.invoice.findMany({
    where: { clientProfileId, status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] } },
    orderBy: { issuedAt: "desc" },
    take: 20,
    select: { id: true, number: true, kind: true, status: true, issuedAt: true, totalMinor: true },
  });
  const dateFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", { timeZone: CENTER_TZ, dateStyle: "medium" });

  return (
    <section className="lunia-card flex flex-col gap-5 p-6" data-testid="invoices-panel">
      <div className="flex flex-col gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">{t("heading")}</h2>
        <p className="text-sm text-[var(--color-ink)]/75">{t("intro")}</p>
      </div>
      {invoices.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]/75">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {invoices.map((inv) => {
            const isCredit = inv.kind === "CREDIT_NOTE";
            const status = isCredit ? t("creditNote") : t(`status.${inv.status as "ISSUED" | "PARTIALLY_PAID" | "PAID"}`);
            return (
              <li key={inv.id}>
                <a
                  href={`/${locale}/invoice/${invoiceToken(inv.id)}`}
                  className="flex min-h-[44px] flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-ink)]/10 px-4 py-3 text-sm transition-colors hover:bg-[var(--color-ink)]/5"
                >
                  <span className="flex flex-col">
                    <span className="font-mono text-[var(--color-ink)]" dir="ltr">
                      {inv.number}
                    </span>
                    <span className="text-xs text-[var(--color-ink)]/75">
                      {inv.issuedAt ? dateFmt.format(inv.issuedAt) : ""} · {status}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-medium tabular-nums text-[var(--color-ink)]" dir="ltr">
                      {isCredit ? "-" : ""}
                      {formatAmount(inv.totalMinor)} SAR
                    </span>
                    <span className="text-xs font-medium text-[var(--color-teal-deep)]">{t("view")}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
