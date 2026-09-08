"use client";

import { useActionState } from "react";
import type { Department } from "@prisma/client";
import { Field } from "../../../_components/Field";
import { LocalizedField, type LocalizedValue } from "../../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../../_components/MediaPicker";
import { updateDepartmentAction, type DepartmentActionState } from "../actions";

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

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <input type="hidden" name="id" value={department.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Slug</span>
          <span className="text-[var(--color-ink)]/70">{department.slug}</span>
        </div>
        <Field label="Order" name="order" type="number" defaultValue={String(department.order)} />
      </div>

      <LocalizedField label="Name" name="name" defaultValue={pair(department.nameEn, department.nameAr)} required />
      <LocalizedField label="Tagline" name="tagline" defaultValue={pair(department.taglineEn, department.taglineAr)} />
      <LocalizedField
        label="Description"
        name="desc"
        type="textarea"
        defaultValue={pair(department.descEn, department.descAr)}
      />

      <MediaPicker label="Hero media" name="heroMediaId" media={media} defaultValue={department.heroMediaId} />

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" name="isPublished" defaultChecked={department.isPublished} className="h-4 w-4" />
        Published
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
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
