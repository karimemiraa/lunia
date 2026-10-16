"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_components/Modal";
import { onActionSuccess } from "../_components/onActionSuccess";
import { toast } from "../_components/toast";
import { InlineStatus, SubmitButton } from "../_ui/Form";
import { updatePackageAction, type CommerceActionState } from "./actions";
import { useStaffLocale, useStaffT } from "../_i18n/StaffI18n";
import type { StaffLocale, T } from "../_i18n/t";

// Package definitions with an Edit popup (names, service, sessions, price,
// validity) and a Retire/Reactivate switch. Existing purchases keep what they
// were sold with; edits apply to new sales.

export interface PackageRowDTO {
  id: string;
  nameEn: string;
  nameAr: string;
  serviceName: string | null;
  serviceId: string | null;
  sessionsTotal: number;
  priceMinor: number;
  isActive: boolean;
  validityDays: number | null;
}

function formatMinor(minor: number, t: T): string {
  return `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${t("SAR")}`;
}

type ServiceOption = { id: string; nameEn: string; nameAr?: string };
const serviceName = (s: ServiceOption, locale: StaffLocale) => (locale === "ar" && s.nameAr ? s.nameAr : s.nameEn);

const inputClass = "lunia-input text-sm";
const initial: CommerceActionState = {};

function EditPackage({ pkg, services, onClose }: { pkg: PackageRowDTO; services: ServiceOption[]; onClose: () => void }) {
  const router = useRouter();
  const t = useStaffT();
  const locale = useStaffLocale();
  const [state, action] = useActionState(
    onActionSuccess(updatePackageAction, () => {
      toast({ title: t("Package saved"), tone: "success" });
      onClose();
      router.refresh();
    }),
    initial,
  );
  return (
    <Modal title={t("Edit “{name}”", { name: locale === "ar" && pkg.nameAr ? pkg.nameAr : pkg.nameEn })} onClose={onClose}>
      <form action={action} className="flex flex-col gap-4" data-testid="edit-package-form">
        <input type="hidden" name="packageId" value={pkg.id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("Name (English)")}</span>
            <input name="nameEn" dir="ltr" defaultValue={pkg.nameEn} required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("Name (Arabic)")}</span>
            <input name="nameAr" defaultValue={pkg.nameAr} dir="rtl" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("Service")}</span>
            <select name="serviceId" defaultValue={pkg.serviceId ?? ""} className={inputClass}>
              <option value="">{t("Any service")}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {serviceName(s, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("Sessions")}</span>
            <input name="sessionsTotal" type="number" min={1} step={1} defaultValue={pkg.sessionsTotal} required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("Price (SAR)")}</span>
            <input name="priceSar" type="number" min={0} step="0.01" defaultValue={(pkg.priceMinor / 100).toFixed(2)} required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("Valid for (days)")}</span>
            <input name="validityDays" type="number" min={1} max={3650} step={1} defaultValue={pkg.validityDays ?? ""} placeholder={t("Never expires")} className={inputClass} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input name="isActive" type="checkbox" defaultChecked={pkg.isActive} className="h-4 w-4" />
          {t("On sale (untick to retire it — customers who already bought it can still use it)")}
        </label>
        <p className="text-xs text-[var(--color-ink)]/60">{t("Changes apply to new sales only; existing purchases keep their sessions and expiry.")}</p>
        <div className="flex items-center gap-3">
          <SubmitButton pendingLabel={t("Saving…")}>{t("Save package")}</SubmitButton>
          <InlineStatus error={state.error} />
        </div>
      </form>
    </Modal>
  );
}

export function PackagesTable({ packages, services, canEdit = true }: { packages: PackageRowDTO[]; services: ServiceOption[]; canEdit?: boolean }) {
  const [editing, setEditing] = useState<PackageRowDTO | null>(null);
  const t = useStaffT();
  const locale = useStaffLocale();
  if (packages.length === 0) {
    return <p className="text-sm text-[var(--color-ink)]/60">{t("No packages created yet.")}</p>;
  }

  return (
    <div className="overflow-x-auto lunia-card">
      <table className="w-full text-start text-sm" data-testid="packages-table">
        <thead className="bg-[var(--color-cream)]/60">
          <tr>
            <th className="px-4 py-2 text-start font-medium text-[var(--color-ink)]">{t("Name")}</th>
            <th className="px-4 py-2 text-start font-medium text-[var(--color-ink)]">{t("Service")}</th>
            <th className="px-4 py-2 text-start font-medium text-[var(--color-ink)]">{t("Sessions")}</th>
            <th className="px-4 py-2 text-start font-medium text-[var(--color-ink)]">{t("Price")}</th>
            <th className="px-4 py-2 text-start font-medium text-[var(--color-ink)]">{t("Valid for")}</th>
            <th className="px-4 py-2 text-start font-medium text-[var(--color-ink)]">{t("Status")}</th>
            <th className="px-4 py-2" aria-label={t("Actions")} />
          </tr>
        </thead>
        <tbody>
          {packages.map((pkg) => (
            <tr key={pkg.id} className="border-t border-[var(--color-ink)]/10" data-testid="package-row">
              <td className="px-4 py-2 text-[var(--color-ink)]">
                {locale === "ar" ? (
                  <>
                    {pkg.nameAr} <span className="text-[var(--color-ink)]/50" dir="ltr">({pkg.nameEn})</span>
                  </>
                ) : (
                  <>
                    {pkg.nameEn} <span className="text-[var(--color-ink)]/50" dir="rtl">({pkg.nameAr})</span>
                  </>
                )}
              </td>
              <td className="px-4 py-2 text-[var(--color-ink)]/70">{pkg.serviceName ?? t("Any service")}</td>
              <td className="px-4 py-2 tabular-nums text-[var(--color-ink)]">{pkg.sessionsTotal}</td>
              <td className="whitespace-nowrap px-4 py-2 tabular-nums text-[var(--color-ink)]">{formatMinor(pkg.priceMinor, t)}</td>
              <td className="whitespace-nowrap px-4 py-2 text-[var(--color-ink)]/70">{pkg.validityDays ? t("{count} days", { count: pkg.validityDays }) : t("No expiry")}</td>
              <td className="px-4 py-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    pkg.isActive ? "bg-[var(--color-teal)]/15 text-[var(--color-teal-ink)]" : "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/60"
                  }`}
                >
                  {pkg.isActive ? t("On sale") : t("Retired")}
                </span>
              </td>
              <td className="px-4 py-2 text-end">
                {canEdit && (<button type="button" onClick={() => setEditing(pkg)} className="lunia-btn lunia-btn-ghost lunia-btn-sm" data-testid="edit-package">
                  {t("Edit")}
                </button>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing && <EditPackage pkg={editing} services={services} onClose={() => setEditing(null)} />}
    </div>
  );
}
