"use client";

import { useActionState } from "react";
import type { Department, Service } from "@prisma/client";
import { Field } from "../../../_components/Field";
import { LocalizedField, type LocalizedValue } from "../../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../../_components/MediaPicker";
import { updateServiceAction, type ServiceActionState } from "../actions";

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
}

export function EditServiceForm({ service, departments, media }: EditServiceFormProps) {
  const [state, action, pending] = useActionState(updateServiceAction, initialState);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <input type="hidden" name="id" value={service.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Slug</span>
          <span className="text-[var(--color-ink)]/70">{service.slug}</span>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Department</span>
          <select name="departmentId" required defaultValue={service.departmentId} className={selectClass}>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.nameEn}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Field label="Order" name="order" type="number" defaultValue={String(service.order)} />

      <LocalizedField label="Name" name="name" defaultValue={pair(service.nameEn, service.nameAr)} required />
      <LocalizedField label="Summary" name="summary" type="textarea" defaultValue={pair(service.summaryEn, service.summaryAr)} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/70">
          Benefits (EN, one per line)
          <textarea
            name="benefitsEn"
            dir="ltr"
            rows={4}
            defaultValue={joinLines(service.benefitsEn)}
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/70">
          Benefits (AR, one per line)
          <textarea
            name="benefitsAr"
            dir="rtl"
            rows={4}
            defaultValue={joinLines(service.benefitsAr)}
            className={selectClass}
          />
        </label>
      </div>

      <MediaPicker label="Hero media" name="heroMediaId" media={media} defaultValue={service.heroMediaId} />

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" name="isPublished" defaultChecked={service.isPublished} className="h-4 w-4" />
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
