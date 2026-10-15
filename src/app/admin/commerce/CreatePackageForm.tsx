"use client";

import { useActionState, useId, useRef } from "react";
import { createPackageAction, type CommerceActionState } from "./actions";
import { InlineStatus } from "../_ui/Form";
import { useStaffLocale, useStaffT } from "../_i18n/StaffI18n";

interface ServiceOption {
  id: string;
  nameEn: string;
  nameAr?: string;
}

const initialState: CommerceActionState = {};

const inputClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

/** Creates a new sellable session package. Guarded by SETTINGS_MANAGE server-side. */
export function CreatePackageForm({ services }: { services: ServiceOption[] }) {
  const [state, action, pending] = useActionState(createPackageAction, initialState);
  const nameEnId = useId();
  const nameArId = useId();
  const serviceId = useId();
  const sessionsId = useId();
  const priceId = useId();
  const activeId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const t = useStaffT();
  const locale = useStaffLocale();

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      data-testid="create-package-form"
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label htmlFor={nameEnId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Name (English)")}</span>
          <input id={nameEnId} name="nameEn" dir="ltr" type="text" required className={inputClass} />
        </label>
        <label htmlFor={nameArId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Name (Arabic)")}</span>
          <input id={nameArId} name="nameAr" type="text" dir="rtl" required className={inputClass} />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label htmlFor={serviceId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Service (optional)")}</span>
          <select id={serviceId} name="serviceId" defaultValue="" className={inputClass}>
            <option value="">{t("Any service")}</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {locale === "ar" && service.nameAr ? service.nameAr : service.nameEn}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor={sessionsId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Sessions")}</span>
          <input id={sessionsId} name="sessionsTotal" type="number" min={1} step={1} required className={inputClass} />
        </label>

        <label htmlFor={priceId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Price (SAR)")}</span>
          <input id={priceId} name="priceSar" type="number" min={0} step="0.01" required className={inputClass} />
        </label>
      </div>

      <label className="flex max-w-xs flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">{t("Valid for (days)")}</span>
        <input name="validityDays" type="number" min={1} max={3650} step={1} placeholder={t("Leave blank: never expires")} className={inputClass} />
        <span className="text-xs text-[var(--color-ink)]/55">{t("Counted from the purchase date. Customers get a reminder 14 days before.")}</span>
      </label>

      <label htmlFor={activeId} className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input id={activeId} name="isActive" type="checkbox" defaultChecked className="h-4 w-4" />
        {t("Active (available for purchase)")}
      </label>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? t("Creating…") : t("Create package")}
        </button>
        <InlineStatus error={state.error} />
        <InlineStatus success={state.success ? t("Saved.") : undefined} />
      </div>
    </form>
  );
}
