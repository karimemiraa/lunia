"use client";

import { useActionState, useState } from "react";
import { LocalizedField, type LocalizedValue } from "../../_components/LocalizedField";
import { savePageContent, type SavePageContentState } from "../actions";

export interface MediaOption {
  id: string;
  filename: string;
  storageKey: string;
  kind: string;
}

interface ContentEditorFormProps {
  pageKey: string;
  media: MediaOption[];
  heroMediaId: string | null;
  headline: LocalizedValue;
  cta: LocalizedValue;
  intro: LocalizedValue;
}

const initialState: SavePageContentState = {};

const selectClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

export function ContentEditorForm({ pageKey, media, heroMediaId, headline, cta, intro }: ContentEditorFormProps) {
  const [state, action, pending] = useActionState(savePageContent, initialState);
  const [selectedMediaId, setSelectedMediaId] = useState(heroMediaId ?? "");

  const selectedMedia = media.find((item) => item.id === selectedMediaId);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <input type="hidden" name="pageKey" value={pageKey} />

      <fieldset className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Hero media</span>
          <select
            name="heroMediaId"
            value={selectedMediaId}
            onChange={(event) => setSelectedMediaId(event.target.value)}
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

        {selectedMedia && selectedMedia.kind === "IMAGE" && (
          <div className="mt-2 flex h-32 w-48 items-center justify-center overflow-hidden rounded bg-[var(--color-cream)]/50">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded assets, no static domain to configure for next/image */}
            <img
              src={`/api/media/${selectedMedia.storageKey}`}
              alt={selectedMedia.filename}
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </fieldset>

      <LocalizedField label="Headline" name="headline" defaultValue={headline} />
      <LocalizedField label="Call to action" name="cta" defaultValue={cta} />
      <LocalizedField label="Intro" name="intro" type="textarea" defaultValue={intro} />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state?.success && <p className="text-sm text-[var(--color-teal)]">Saved.</p>}
        {state?.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
