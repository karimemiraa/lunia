"use client";

import { useActionState } from "react";
import { Field } from "../../_components/Field";
import { LocalizedField } from "../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../_components/MediaPicker";
import { createDepartmentAction, type DepartmentActionState } from "./actions";
import { InlineStatus } from "../../_ui/Form";
import { useStaffT } from "../../_i18n/StaffI18n";

const initialState: DepartmentActionState = {};

const emptyLocalized = { en: "", ar: "" };

export function CreateDepartmentForm({ media }: { media: MediaOption[] }) {
  const [state, action, pending] = useActionState(createDepartmentAction, initialState);
  const t = useStaffT();

  return (
    <form
      action={action}
      data-testid="create-department-form"
      className="flex flex-col gap-4 lunia-card p-5"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Create department")}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Slug")} name="slug" dir="ltr" placeholder={t("e.g. {example}", { example: "skin" })} required />
        <Field label={t("Order")} name="order" type="number" placeholder="0" />
      </div>

      <LocalizedField label={t("Name")} name="name" defaultValue={emptyLocalized} required />
      <LocalizedField label={t("Tagline")} name="tagline" defaultValue={emptyLocalized} />
      <LocalizedField label={t("Description")} name="desc" type="textarea" defaultValue={emptyLocalized} />

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
          {pending ? t("Creating…") : t("Create department")}
        </button>
        <InlineStatus success={state.success ? t("Created.") : undefined} />
        <InlineStatus error={state.error} />
      </div>
    </form>
  );
}
