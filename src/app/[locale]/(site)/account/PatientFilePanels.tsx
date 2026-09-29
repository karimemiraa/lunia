import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ConsentStatusRow } from "@/modules/clinical/consents";

// Account-page cards for the customer's side of the patient file: the health
// questionnaire and consent forms. Server components (no interactivity; the
// forms live on their own pages).

const CENTER_TZ = "Asia/Riyadh";
const fmtDate = (d: Date, locale: string) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", { timeZone: CENTER_TZ, dateStyle: "medium" }).format(d);

const primaryBtn =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--color-ink)] px-6 text-sm font-medium tracking-wide text-[var(--color-on-ink)] transition-opacity hover:opacity-90";
const ghostBtn =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--color-ink)]/20 px-5 text-sm font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-ink)]/5";

export async function HealthProfileCard({ locale, lastUpdatedAt }: { locale: "ar" | "en"; lastUpdatedAt: Date | null }) {
  const t = await getTranslations({ locale, namespace: "health.card" });
  return (
    <section className="lunia-card flex flex-col gap-4 p-6" data-testid="health-card">
      <div className="flex flex-col gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">{t("heading")}</h2>
        <p className="text-sm text-[var(--color-ink)]/75">{t("intro")}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--color-ink)]/75">
          {lastUpdatedAt ? t("updated", { date: fmtDate(lastUpdatedAt, locale) }) : t("empty")}
        </p>
        <Link href={`/${locale}/account/health`} className={lastUpdatedAt ? ghostBtn : primaryBtn}>
          {lastUpdatedAt ? t("update") : t("start")}
        </Link>
      </div>
    </section>
  );
}

export async function ConsentsCard({ locale, rows }: { locale: "ar" | "en"; rows: ConsentStatusRow[] }) {
  const t = await getTranslations({ locale, namespace: "consents.card" });
  return (
    <section className="lunia-card flex flex-col gap-4 p-6" data-testid="consents-card">
      <div className="flex flex-col gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">{t("heading")}</h2>
        <p className="text-sm text-[var(--color-ink)]/75">{t("intro")}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-ink)]/75">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const outdated = row.lastSignedAt !== null && !row.upToDate;
            return (
              <li key={row.formId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-ink)]/10 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--color-ink)]">
                    {locale === "ar" ? row.titleAr : row.titleEn}
                    <span className="rounded-full bg-[var(--color-ink)]/8 px-2 py-0.5 text-[0.7rem] font-medium text-[var(--color-ink)]/75">
                      {row.required ? t("required") : t("optional")}
                    </span>
                  </span>
                  <span className={`text-xs ${row.upToDate ? "text-[var(--color-teal-ink)]" : "text-[var(--color-ink)]/75"}`}>
                    {row.upToDate && row.lastSignedAt
                      ? t("signed", { date: fmtDate(row.lastSignedAt, locale) })
                      : outdated
                        ? t("newVersion")
                        : t("needsSignature")}
                  </span>
                </div>
                {row.upToDate && row.lastSignatureId ? (
                  <Link href={`/${locale}/account/consents/signed/${row.lastSignatureId}`} className={ghostBtn}>
                    {t("view")}
                  </Link>
                ) : (
                  <Link href={`/${locale}/account/consents/${row.formId}`} className={primaryBtn}>
                    {t("sign")}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
