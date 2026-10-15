"use client";

import { useActionState } from "react";
import type { Department } from "@prisma/client";
import { Field } from "../../_components/Field";
import { LocalizedField } from "../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../_components/MediaPicker";
import { createServiceAction, type ServiceActionState } from "./actions";
import { InlineStatus } from "../../_ui/Form";
import { useStaffLocale, useStaffT } from "../../_i18n/StaffI18n";

const initialState: ServiceActionState = {};

const emptyLocalized = { en: "", ar: "" };

const selectClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

interface CreateServiceFormProps {
  departments: Department[];
  media: MediaOption[];
}

export function CreateServiceForm({ departments, media }: CreateServiceFormProps) {
  const [state, action, pending] = useActionState(createServiceAction, initialState);
  const t = useStaffT();
  const locale = useStaffLocale();

  return (
    <form
      action={action}
      data-testid="create-service-form"
      className="flex flex-col gap-4 lunia-card p-5"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Create service")}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Slug")} name="slug" dir="ltr" placeholder={t("e.g. {example}", { example: "led-light-therapy" })} required />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Department")}</span>
          <select name="departmentId" required className={selectClass} defaultValue="">
            <option value="" disabled>
              {t("Select a department")}
            </option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {locale === "ar" && department.nameAr ? department.nameAr : department.nameEn}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Field label={t("Order")} name="order" type="number" placeholder="0" />

      <LocalizedField label={t("Name")} name="name" defaultValue={emptyLocalized} required />
      <LocalizedField label={t("Summary")} name="summary" type="textarea" defaultValue={emptyLocalized} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/70">
          {t("Benefits (EN, one per line)")}
          <textarea name="benefitsEn" dir="ltr" rows={4} className={selectClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/70">
          {t("Benefits (AR, one per line)")}
          <textarea name="benefitsAr" dir="rtl" rows={4} className={selectClass} />
        </label>
      </div>

      <MediaPicker label={t("Hero media")} name="heroMediaId" media={media} />

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" name="isPublished" defaultChecked className="h-4 w-4" />
        {t("Published")}
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? t("Creating…") : t("Create service")}
        </button>
        <InlineStatus success={state.success ? t("Created.") : undefined} />
        <InlineStatus error={state.error} />
      </div>
    </form>
  );
}
