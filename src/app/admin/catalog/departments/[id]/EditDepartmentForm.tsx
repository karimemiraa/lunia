"use client";

import { useActionState } from "react";
import type { Department } from "@prisma/client";
import { Field } from "../../../_components/Field";
import { LocalizedField, type LocalizedValue } from "../../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../../_components/MediaPicker";
import { updateDepartmentAction, type DepartmentActionState } from "../actions";
import { InlineStatus } from "../../../_ui/Form";
import { useStaffT } from "../../../_i18n/StaffI18n";

const initialState: DepartmentActionState = {};

interface EditDepartmentFormProps {
  department: Department;
  media: MediaOption[];
}

function pair(en: string, ar: string): LocalizedValue {
  return { en, ar };
}

export function EditDepartmentForm({ department, media }: EditDepartmentFormProps) {
  const [state, action, pending] = useActionState(updateDepartmentAction, initialState);
  const t = useStaffT();

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <input type="hidden" name="id" value={department.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Slug")}</span>
          <span className="text-[var(--color-ink)]/70" dir="ltr">{department.slug}</span>
        </div>
        <Field label={t("Order")} name="order" type="number" defaultValue={String(department.order)} />
      </div>

      <LocalizedField label={t("Name")} name="name" defaultValue={pair(department.nameEn, department.nameAr)} required />
      <LocalizedField label={t("Tagline")} name="tagline" defaultValue={pair(department.taglineEn, department.taglineAr)} />
      <LocalizedField
        label={t("Description")}
        name="desc"
        type="textarea"
        defaultValue={pair(department.descEn, department.descAr)}
      />

      <MediaPicker label={t("Hero media")} name="heroMediaId" media={media} defaultValue={department.heroMediaId} />

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" name="isPublished" defaultChecked={department.isPublished} className="h-4 w-4" />
        {t("Published")}
      </label>

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
