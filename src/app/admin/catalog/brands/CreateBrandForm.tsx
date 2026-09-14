"use client";

import { useActionState } from "react";
import { Field } from "../../_components/Field";
import { LocalizedField } from "../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../_components/MediaPicker";
import { createBrandAction, type BrandActionState } from "./actions";

const initialState: BrandActionState = {};

const emptyLocalized = { en: "", ar: "" };

export function CreateBrandForm({ media }: { media: MediaOption[] }) {
  const [state, action, pending] = useActionState(createBrandAction, initialState);

  return (
    <form
      action={action}
      data-testid="create-brand-form"
      className="flex flex-col gap-4 lunia-card p-5"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Create brand</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Slug" name="slug" placeholder="e.g. zo-skin-health" required />
        <Field label="Name" name="name" placeholder="e.g. ZO Skin Health" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Website URL" name="url" type="url" placeholder="https://..." />
        <Field label="Order" name="order" type="number" placeholder="0" />
      </div>

      <LocalizedField label="Description" name="desc" type="textarea" defaultValue={emptyLocalized} />
      <LocalizedField label="Why we chose it" name="whyChosen" type="textarea" defaultValue={emptyLocalized} />

      <MediaPicker label="Logo media" name="logoMediaId" media={media} />

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" name="isPublished" defaultChecked className="h-4 w-4" />
        Published
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create brand"}
        </button>
        {state.success && <p className="text-sm text-[var(--color-teal)]">Created.</p>}
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
