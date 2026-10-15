"use client";

import { useActionState } from "react";
import { Field } from "../../_components/Field";
import { LocalizedField } from "../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../_components/MediaPicker";
import { createBrandAction, type BrandActionState } from "./actions";
import { InlineStatus } from "../../_ui/Form";
import { useStaffT } from "../../_i18n/StaffI18n";

const initialState: BrandActionState = {};

const emptyLocalized = { en: "", ar: "" };

export function CreateBrandForm({ media }: { media: MediaOption[] }) {
  const [state, action, pending] = useActionState(createBrandAction, initialState);
  const t = useStaffT();

  return (
    <form
      action={action}
      data-testid="create-brand-form"
      className="flex flex-col gap-4 lunia-card p-5"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Create brand")}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Slug")} name="slug" dir="ltr" placeholder={t("e.g. {example}", { example: "zo-skin-health" })} required />
        <Field label={t("Name")} name="name" placeholder={t("e.g. {example}", { example: "ZO Skin Health" })} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Website URL")} name="url" type="url" dir="ltr" placeholder="https://..." />
        <Field label={t("Order")} name="order" type="number" placeholder="0" />
      </div>

      <LocalizedField label={t("Description")} name="desc" type="textarea" defaultValue={emptyLocalized} />
      <LocalizedField label={t("Why we chose it")} name="whyChosen" type="textarea" defaultValue={emptyLocalized} />

      <MediaPicker label={t("Logo media")} name="logoMediaId" media={media} />

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
          {pending ? t("Creating…") : t("Create brand")}
        </button>
        <InlineStatus success={state.success ? t("Created.") : undefined} />
        <InlineStatus error={state.error} />
      </div>
    </form>
  );
}
