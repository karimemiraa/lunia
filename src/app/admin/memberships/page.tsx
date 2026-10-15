import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { prisma } from "@/lib/db";
import { listPlans, listSubscriptions, membershipStats } from "@/modules/memberships/memberships";
import { PlansSection, EnrolForm, MembersTable } from "./MembershipsClient";
import { getStaffLocale, getStaffT } from "../_i18n/display";
import { intlLocale } from "../_i18n/t";

// Paid monthly memberships: plans, enrolment, and members. Each month is
// billed by an invoice with a pay link (Settings → Automations runs it daily).
export default async function MembershipsPage() {
  const user = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  const canEditPlans = user.permissions.has(PERMISSIONS.SETTINGS_MANAGE);
  const [t, locale] = await Promise.all([getStaffT(), getStaffLocale()]);
  const dFmt = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" });
  const sar = (minor: number) => `${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${t("SAR")}`;
  const planName = (p: { nameEn: string; nameAr: string }) => (locale === "ar" && p.nameAr ? p.nameAr : p.nameEn);
  const [plans, subs, stats, services] = await Promise.all([
    listPlans(),
    listSubscriptions({ status: "LIVE" }),
    membershipStats(),
    prisma.service.findMany({ where: { isPublished: true }, select: { id: true, nameEn: true, nameAr: true }, orderBy: { nameEn: "asc" } }),
  ]);
  const clients = await prisma.clientProfile.findMany({ where: { id: { in: subs.map((s) => s.clientProfileId) } }, select: { id: true, fullName: true } });
  const nameById = new Map(clients.map((c) => [c.id, c.fullName]));

  const tiles = [
    { label: t("Active members"), value: String(stats.active) },
    { label: t("Past due"), value: String(stats.pastDue) },
    { label: t("Paused"), value: String(stats.paused) },
    { label: t("Monthly revenue"), value: sar(stats.monthlyRevenueMinor) },
  ];

  return (
    <AdminShell user={user} title="Memberships" description="Monthly plans billed by invoice and pay link. Members get their plan's discount at checkout and their included sessions each paid month.">
      <div className="flex flex-col gap-8">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="membership-stats">
          {tiles.map((tile) => (
            <div key={tile.label} className="lunia-card p-4">
              <dt className="text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">{tile.label}</dt>
              <dd className="lx-stat mt-1 text-2xl font-semibold">{tile.value}</dd>
            </div>
          ))}
        </dl>

        <PlansSection
          canEdit={canEditPlans}
          services={services}
          plans={plans.map((p) => ({
            id: p.id,
            nameEn: p.nameEn,
            nameAr: p.nameAr,
            descriptionEn: p.descriptionEn,
            descriptionAr: p.descriptionAr,
            priceMinor: p.priceMinor,
            serviceDiscountPct: p.serviceDiscountPct,
            productDiscountPct: p.productDiscountPct,
            includedSessions: p.includedSessions,
            includedServiceId: p.includedServiceId,
            minTermMonths: p.minTermMonths,
            graceDays: p.graceDays,
            isActive: p.isActive,
            members: p._count.subscriptions,
          }))}
        />

        <section className="lunia-card flex flex-col gap-3 p-5">
          <h2 className="text-lg font-semibold">{t("Enrol a customer")}</h2>
          <EnrolForm plans={plans.filter((p) => p.isActive).map((p) => ({ id: p.id, nameEn: p.nameEn, nameAr: p.nameAr, priceMinor: p.priceMinor }))} />
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("Members")}</h2>
          <MembersTable
            members={subs.map((s) => ({
              id: s.id,
              clientProfileId: s.clientProfileId,
              clientName: nameById.get(s.clientProfileId) ?? t("Customer"),
              planName: planName(plans.find((p) => p.id === s.plan.id) ?? { nameEn: s.plan.nameEn, nameAr: "" }),
              priceMinor: s.plan.priceMinor,
              status: s.status,
              periodLabel: `${dFmt.format(s.currentPeriodStart)} – ${dFmt.format(new Date(s.currentPeriodEnd.getTime() - 1))}`,
              monthStatus: s.cycles[0]?.status ?? null,
              invoiceId: s.cycles[0]?.invoiceId ?? null,
              cancelAtLabel: s.cancelAt ? dFmt.format(s.cancelAt) : null,
            }))}
          />
        </section>
      </div>
    </AdminShell>
  );
}
