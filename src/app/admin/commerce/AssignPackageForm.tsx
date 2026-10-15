"use client";

import { useActionState, useId, useRef } from "react";
import { assignPackageAction, type CommerceActionState } from "./actions";
import { InlineStatus } from "../_ui/Form";
import { useStaffLocale, useStaffT } from "../_i18n/StaffI18n";

interface ClientOption {
  clientProfileId: string;
  fullName: string;
  phone: string | null;
}

interface PackageOption {
  id: string;
  nameEn: string;
  nameAr?: string;
  sessionsTotal: number;
}

const initialState: CommerceActionState = {};

const inputClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

/**
 * Records that a client purchased a package (e.g. paid cash at the front
 * desk -- payments stay off in this system, so this is the record-of-sale,
 * not a charge). Guarded by SETTINGS_MANAGE server-side.
 */
export function AssignPackageForm({ clients, packages }: { clients: ClientOption[]; packages: PackageOption[] }) {
  const [state, action, pending] = useActionState(assignPackageAction, initialState);
  const clientId = useId();
  const packageId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const t = useStaffT();
  const locale = useStaffLocale();

  if (packages.length === 0) {
    return <p className="text-sm text-[var(--color-ink)]/60">{t("Create an active package above before recording a purchase.")}</p>;
  }

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      data-testid="assign-package-form"
      className="flex flex-wrap items-end gap-3"
    >
      <label htmlFor={clientId} className="flex flex-1 min-w-[12rem] flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">{t("Customer")}</span>
        <select id={clientId} name="clientProfileId" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            {t("Select a client")}
          </option>
          {clients.map((client) => (
            <option key={client.clientProfileId} value={client.clientProfileId}>
              {client.fullName}
              {client.phone ? ` (${client.phone})` : ""}
            </option>
          ))}
        </select>
      </label>

      <label htmlFor={packageId} className="flex flex-1 min-w-[12rem] flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">{t("Package")}</span>
        <select id={packageId} name="packageId" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            {t("Select a package")}
          </option>
          {packages.map((pkg) => (
            <option key={pkg.id} value={pkg.id}>
              {t("{name} ({count} sessions)", { name: locale === "ar" && pkg.nameAr ? pkg.nameAr : pkg.nameEn, count: pkg.sessionsTotal })}
            </option>
          ))}
        </select>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="lunia-btn lunia-btn-primary disabled:opacity-60"
      >
        {pending ? t("Recording…") : t("Record purchase")}
      </button>
      <InlineStatus error={state.error} className="w-full" />
      <InlineStatus success={state.success ? t("Saved.") : undefined} className="w-full" />
    </form>
  );
}
