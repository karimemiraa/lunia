"use client";

import { useActionState } from "react";
import type { Brand } from "@prisma/client";
import { Field } from "../../../_components/Field";
import { LocalizedField, type LocalizedValue } from "../../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../../_components/MediaPicker";
import { updateBrandAction, type BrandActionState } from "../actions";

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

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <input type="hidden" name="id" value={brand.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Slug</span>
          <span className="text-[var(--color-ink)]/70">{brand.slug}</span>
        </div>
        <Field label="Name" name="name" defaultValue={brand.name} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Website URL" name="url" type="url" defaultValue={brand.url ?? ""} />
        <Field label="Order" name="order" type="number" defaultValue={String(brand.order)} />
      </div>

      <LocalizedField label="Description" name="desc" type="textarea" defaultValue={pair(brand.descEn, brand.descAr)} />
      <LocalizedField
        label="Why we chose it"
        name="whyChosen"
        type="textarea"
        defaultValue={pair(brand.whyChosenEn, brand.whyChosenAr)}
      />

      <MediaPicker label="Logo media" name="logoMediaId" media={media} defaultValue={brand.logoMediaId} />

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" name="isPublished" defaultChecked={brand.isPublished} className="h-4 w-4" />
        Published
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.success && <p className="text-sm text-[var(--color-teal)]">Saved.</p>}
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
