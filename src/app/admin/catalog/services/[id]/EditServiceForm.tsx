"use client";

import { useActionState } from "react";
import type { Department, MembershipTier, Service } from "@prisma/client";
import { Field } from "../../../_components/Field";
import { LocalizedField, type LocalizedValue } from "../../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../../_components/MediaPicker";
import { updateServiceAction, type ServiceActionState } from "../actions";
import { InlineStatus } from "../../../_ui/Form";
import { useStaffLocale, useStaffT } from "../../../_i18n/StaffI18n";

const initialState: ServiceActionState = {};

const selectClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

function pair(en: string, ar: string): LocalizedValue {
  return { en, ar };
}

function joinLines(value: unknown): string {
  return Array.isArray(value) ? (value as string[]).join("\n") : "";
}

interface EditServiceFormProps {
  service: Service;
  departments: Department[];
  media: MediaOption[];
  tiers: MembershipTier[];
  currentMinTierId: string | null;
}

// priceMinor is stored in halalas (1/100 SAR); the form shows/edits SAR with
// up to 2 decimal places and the action converts back to minor units.
function minorToSar(priceMinor: number): string {
  return (priceMinor / 100).toString();
}

export function EditServiceForm({ service, departments, media, tiers, currentMinTierId }: EditServiceFormProps) {
  const [state, action, pending] = useActionState(updateServiceAction, initialState);
  const t = useStaffT();
  const locale = useStaffLocale();

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <input type="hidden" name="id" value={service.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Slug")}</span>
          <span className="text-[var(--color-ink)]/70" dir="ltr">{service.slug}</span>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Department")}</span>
          <select name="departmentId" required defaultValue={service.departmentId} className={selectClass}>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {locale === "ar" && department.nameAr ? department.nameAr : department.nameEn}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Field label={t("Order")} name="order" type="number" defaultValue={String(service.order)} />

      <LocalizedField label={t("Name")} name="name" defaultValue={pair(service.nameEn, service.nameAr)} required />
      <LocalizedField label={t("Summary")} name="summary" type="textarea" defaultValue={pair(service.summaryEn, service.summaryAr)} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/70">
          {t("Benefits (EN, one per line)")}
          <textarea
            name="benefitsEn"
            dir="ltr"
            rows={4}
            defaultValue={joinLines(service.benefitsEn)}
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/70">
          {t("Benefits (AR, one per line)")}
          <textarea
            name="benefitsAr"
            dir="rtl"
            rows={4}
            defaultValue={joinLines(service.benefitsAr)}
            className={selectClass}
          />
        </label>
      </div>

      <MediaPicker label={t("Hero media")} name="heroMediaId" media={media} defaultValue={service.heroMediaId} />

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" name="isPublished" defaultChecked={service.isPublished} className="h-4 w-4" />
        {t("Published")}
      </label>

      <fieldset className="flex flex-col gap-4 rounded border border-[var(--color-ink)]/10 p-4">
        <legend className="px-1 text-sm font-medium text-[var(--color-ink)]">{t("Booking settings")}</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Duration (min)")} name="durationMin" type="number" defaultValue={String(service.durationMin)} required />
          <Field
            label={t("Price (SAR)")}
            name="priceSar"
            type="number"
            step="0.01"
            defaultValue={minorToSar(service.priceMinor)}
            required
          />
        </div>

        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
            <input type="checkbox" name="onlineBookable" defaultChecked={service.onlineBookable} className="h-4 w-4" />
            {t("Online bookable")}
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
            <input type="checkbox" name="inCenterOnly" defaultChecked={service.inCenterOnly} className="h-4 w-4" />
            {t("In-center only")}
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Minimum tier")}</span>
          <select name="minTierId" defaultValue={currentMinTierId ?? ""} className={selectClass}>
            <option value="">{t("Open to all customers")}</option>
            {tiers.map((tier) => (
              <option key={tier.id} value={tier.id}>
                {locale === "ar" && tier.nameAr ? tier.nameAr : tier.name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? t("Saving…") : t("Save")}
        </button>
        <InlineStatus success={state.success ? t("Saved.") : undefined} />
        <InlineStatus error={state.error} />
      </div>
    </form>
  );
}
