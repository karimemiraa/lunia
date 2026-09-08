"use client";
import { useState } from "react";

export interface MediaOption {
  id: string;
  filename: string;
  storageKey: string;
  kind: string;
}

interface MediaPickerProps {
  label: string;
  name: string;
  media: MediaOption[];
  defaultValue?: string | null;
}

const selectClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

/**
 * A `<select>` over the media library plus a small preview, emitting a
 * single `name` field carrying the chosen MediaAsset id (or "" for none).
 * Mirrors the inline picker in admin/content/[pageKey]/ContentEditorForm.tsx,
 * pulled out here since the catalog admin surfaces (departments, services,
 * brands, journal) all need the same picker for hero/logo media.
 */
export function MediaPicker({ label, name, media, defaultValue }: MediaPickerProps) {
  const [selectedId, setSelectedId] = useState(defaultValue ?? "");
  const selected = media.find((item) => item.id === selectedId);

  return (
    <fieldset className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">{label}</span>
        <select
          name={name}
          value={selectedId}
          onChange={(event) => setSelectedId(event.target.value)}
          className={selectClass}
        >
          <option value="">None</option>
          {media.map((item) => (
            <option key={item.id} value={item.id}>
              {item.filename}
            </option>
          ))}
        </select>
      </label>

      {selected && selected.kind === "IMAGE" && (
        <div className="mt-2 flex h-32 w-48 items-center justify-center overflow-hidden rounded bg-[var(--color-cream)]/50">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded assets, no static domain to configure for next/image */}
          <img
            src={`/api/media/${selected.storageKey}`}
            alt={selected.filename}
            className="h-full w-full object-cover"
          />
        </div>
      )}
    </fieldset>
  );
}
