// Purely presentational ledger of package purchases across all clients
// (a server component: it reads the staff locale itself).
import { getStaffLocale, getStaffT } from "../_i18n/display";
import { intlLocale, type StaffLocale } from "../_i18n/t";

export interface PackagePurchaseRowDTO {
  id: string;
  clientName: string;
  packageNameEn: string;
  packageNameAr?: string;
  sessionsRemaining: number;
  sessionsTotal: number;
  status: "ACTIVE" | "EXHAUSTED" | "EXPIRED";
  createdAtIso: string;
  expiresAtIso: string | null;
}

function formatDate(iso: string, locale: StaffLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale, "en-US"), { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(iso));
}

const STATUS_STYLES: Record<PackagePurchaseRowDTO["status"], string> = {
  ACTIVE: "bg-[var(--color-teal)]/15 text-[var(--color-teal)]",
  EXHAUSTED: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/60",
  EXPIRED: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<PackagePurchaseRowDTO["status"], string> = { ACTIVE: "ACTIVE", EXHAUSTED: "EXHAUSTED", EXPIRED: "EXPIRED" };

export async function PackagePurchasesTable({ purchases }: { purchases: PackagePurchaseRowDTO[] }) {
  const [t, locale] = await Promise.all([getStaffT(), getStaffLocale()]);
  if (purchases.length === 0) {
    return <p className="text-sm text-[var(--color-ink)]/60">{t("No package purchases recorded yet.")}</p>;
  }

  return (
    <div className="overflow-x-auto lunia-card">
      <table className="w-full text-start text-sm" data-testid="package-purchases-table">
        <thead className="bg-[var(--color-cream)]/60">
          <tr>
            <th className="px-4 py-2 text-start font-medium text-[var(--color-ink)]">{t("Customer")}</th>
            <th className="px-4 py-2 text-start font-medium text-[var(--color-ink)]">{t("Package")}</th>
            <th className="px-4 py-2 text-start font-medium text-[var(--color-ink)]">{t("Sessions left")}</th>
            <th className="px-4 py-2 text-start font-medium text-[var(--color-ink)]">{t("Status")}</th>
            <th className="px-4 py-2 text-start font-medium text-[var(--color-ink)]">{t("Purchased")}</th>
            <th className="px-4 py-2 text-start font-medium text-[var(--color-ink)]">{t("Expires")}</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((purchase) => (
            <tr key={purchase.id} className="border-t border-[var(--color-ink)]/10" data-testid="package-purchase-row">
              <td className="px-4 py-2 text-[var(--color-ink)]">{purchase.clientName}</td>
              <td className="px-4 py-2 text-[var(--color-ink)]/70">{locale === "ar" && purchase.packageNameAr ? purchase.packageNameAr : purchase.packageNameEn}</td>
              <td className="px-4 py-2 text-[var(--color-ink)]">
                {purchase.sessionsRemaining} / {purchase.sessionsTotal}
              </td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[purchase.status]}`}>
                  {t(STATUS_LABEL[purchase.status])}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-[var(--color-ink)]/70">{formatDate(purchase.createdAtIso, locale)}</td>
              <td className="whitespace-nowrap px-4 py-2 text-[var(--color-ink)]/70">{purchase.expiresAtIso ? formatDate(purchase.expiresAtIso, locale) : t("Never")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
