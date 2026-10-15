"use client";

import { useActionState } from "react";
import type { Brand } from "@prisma/client";
import { Field } from "../../../_components/Field";
import { LocalizedField, type LocalizedValue } from "../../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../../_components/MediaPicker";
import { updateBrandAction, type BrandActionState } from "../actions";
import { InlineStatus } from "../../../_ui/Form";
import { useStaffT } from "../../../_i18n/StaffI18n";

const initialState: BrandActionState = {};

function pair(en: string, ar: string): LocalizedValue {
  return { en, ar };
}

interface EditBrandFormProps {
  brand: Brand;
  media: MediaOption[];
}

export function EditBrandForm({ brand, media }: EditBrandFormProps) {
  const [state, action, pending] = useActionState(updateBrandAction, initialState);
  const t = useStaffT();

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <input type="hidden" name="id" value={brand.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Slug")}</span>
          <span className="text-[var(--color-ink)]/70" dir="ltr">{brand.slug}</span>
        </div>
        <Field label={t("Name")} name="name" defaultValue={brand.name} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Website URL")} name="url" type="url" dir="ltr" defaultValue={brand.url ?? ""} />
        <Field label={t("Order")} name="order" type="number" defaultValue={String(brand.order)} />
      </div>

      <LocalizedField label={t("Description")} name="desc" type="textarea" defaultValue={pair(brand.descEn, brand.descAr)} />
      <LocalizedField
        label={t("Why we chose it")}
        name="whyChosen"
        type="textarea"
        defaultValue={pair(brand.whyChosenEn, brand.whyChosenAr)}
      />

      <MediaPicker label={t("Logo media")} name="logoMediaId" media={media} defaultValue={brand.logoMediaId} />

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" name="isPublished" defaultChecked={brand.isPublished} className="h-4 w-4" />
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
