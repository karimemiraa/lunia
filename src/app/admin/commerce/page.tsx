import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listGiftCards } from "@/modules/commerce/giftcards";
import { listPackages, listPackagePurchases } from "@/modules/commerce/packages";
import { prisma } from "@/lib/db";
import { listServices } from "@/modules/catalog/services";
import { IssueGiftCardForm } from "./IssueGiftCardForm";
import { GiftCardsTable, type GiftCardRowDTO } from "./GiftCardsTable";
import { CreatePackageForm } from "./CreatePackageForm";
import { PackagesTable, type PackageRowDTO } from "./PackagesTable";
import { AssignPackageForm } from "./AssignPackageForm";
import { PackagePurchasesTable, type PackagePurchaseRowDTO } from "./PackagePurchasesTable";
import { getStaffLocale, getStaffT } from "../_i18n/display";

const sectionClass = "flex flex-col gap-4 lunia-card p-5";

export default async function CommercePage() {
  const user = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  const [t, locale] = await Promise.all([getStaffT(), getStaffLocale()]);

  const [giftCards, packages, purchases, clients, services] = await Promise.all([
    listGiftCards(),
    listPackages(),
    listPackagePurchases(),
    // Just id/name/phone for the pickers + gift-card names (not the full roster aggregates).
    prisma.clientProfile.findMany({ select: { id: true, fullName: true, user: { select: { phone: true } } }, orderBy: { fullName: "asc" } }),
    listServices(undefined, { publishedOnly: false }),
  ]);

  const serviceNameById = new Map(services.map((service) => [service.id, locale === "ar" && service.nameAr ? service.nameAr : service.nameEn]));
  const clientNameById = new Map(clients.map((c) => [c.id, c.fullName]));

  const giftCardRows: GiftCardRowDTO[] = giftCards.map((card) => ({
    id: card.id,
    code: card.code,
    balanceMinor: card.balanceMinor,
    initialMinor: card.initialMinor,
    currency: card.currency,
    status: card.status,
    issuedToClientName: card.issuedToClientId
      ? (clientNameById.get(card.issuedToClientId) ?? t("Unknown customer"))
      : null,
    expiresAtIso: card.expiresAt ? card.expiresAt.toISOString() : null,
    redemptionCount: card.redemptions.length,
    createdAtIso: card.createdAt.toISOString(),
  }));

  const packageRows: PackageRowDTO[] = packages.map((pkg) => ({
    id: pkg.id,
    nameEn: pkg.nameEn,
    nameAr: pkg.nameAr,
    serviceName: pkg.serviceId ? (serviceNameById.get(pkg.serviceId) ?? null) : null,
    sessionsTotal: pkg.sessionsTotal,
    priceMinor: pkg.priceMinor,
    isActive: pkg.isActive,
    serviceId: pkg.serviceId,
    validityDays: pkg.validityDays,
  }));

  const purchaseRows: PackagePurchaseRowDTO[] = purchases.map((purchase) => ({
    id: purchase.id,
    clientName: purchase.clientName,
    packageNameEn: purchase.packageNameEn,
    packageNameAr: purchase.packageNameAr,
    sessionsRemaining: purchase.sessionsRemaining,
    sessionsTotal: purchase.sessionsTotal,
    status: purchase.status,
    createdAtIso: purchase.createdAt.toISOString(),
    expiresAtIso: purchase.expiresAt ? purchase.expiresAt.toISOString() : null,
  }));

  const clientOptions = clients.map((c) => ({ clientProfileId: c.id, fullName: c.fullName, phone: c.user.phone }));
  const activePackageOptions = packages
    .filter((pkg) => pkg.isActive)
    .map((pkg) => ({ id: pkg.id, nameEn: pkg.nameEn, nameAr: pkg.nameAr, sessionsTotal: pkg.sessionsTotal }));

  return (
    <AdminShell
      user={user}
      title="Gift cards & packages"
      description="Issue gift cards, sell prepaid session packages, and track balances and redemptions."
    >
      <div className="flex flex-col gap-8">
        <section className={sectionClass} data-testid="giftcards-section">
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Issue a gift card")}</h2>
          <IssueGiftCardForm clients={clientOptions} />
        </section>

        <section className="flex flex-col gap-4" data-testid="giftcards-list-section">
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Gift cards")}</h2>
          <GiftCardsTable cards={giftCardRows} />
        </section>

        <section className={sectionClass} data-testid="create-package-section">
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Create a package")}</h2>
          <CreatePackageForm services={services.map((s) => ({ id: s.id, nameEn: s.nameEn, nameAr: s.nameAr }))} />
        </section>

        <section className="flex flex-col gap-4" data-testid="packages-list-section">
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Packages")}</h2>
          <PackagesTable packages={packageRows} services={services.map((s) => ({ id: s.id, nameEn: s.nameEn, nameAr: s.nameAr }))} />
        </section>

        <section className={sectionClass} data-testid="assign-package-section">
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Record a package purchase")}</h2>
          <p className="text-sm text-[var(--color-ink)]/65">
            {t("Payments are off in this system. Use this after a client pays at the front desk to credit their sessions.")}
          </p>
          <AssignPackageForm clients={clientOptions} packages={activePackageOptions} />
        </section>

        <section className="flex flex-col gap-4" data-testid="package-purchases-section">
          <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Package purchases")}</h2>
          <PackagePurchasesTable purchases={purchaseRows} />
        </section>
      </div>
    </AdminShell>
  );
}
