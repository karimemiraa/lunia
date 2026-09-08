"use client";

import { useActionState } from "react";
import type { Department } from "@prisma/client";
import { Field } from "../../_components/Field";
import { LocalizedField } from "../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../_components/MediaPicker";
import { createServiceAction, type ServiceActionState } from "./actions";

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

  return (
    <form
      action={action}
      data-testid="create-service-form"
      className="flex flex-col gap-4 rounded border border-[var(--color-ink)]/10 p-5"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Create service</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Slug" name="slug" placeholder="e.g. led-light-therapy" required />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Department</span>
          <select name="departmentId" required className={selectClass} defaultValue="">
            <option value="" disabled>
              Select a department
            </option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.nameEn}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Field label="Order" name="order" type="number" placeholder="0" />

      <LocalizedField label="Name" name="name" defaultValue={emptyLocalized} required />
      <LocalizedField label="Summary" name="summary" type="textarea" defaultValue={emptyLocalized} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/70">
          Benefits (EN, one per line)
          <textarea name="benefitsEn" dir="ltr" rows={4} className={selectClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/70">
          Benefits (AR, one per line)
          <textarea name="benefitsAr" dir="rtl" rows={4} className={selectClass} />
        </label>
      </div>

      <MediaPicker label="Hero media" name="heroMediaId" media={media} />

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" name="isPublished" defaultChecked className="h-4 w-4" />
        Published
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create service"}
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
