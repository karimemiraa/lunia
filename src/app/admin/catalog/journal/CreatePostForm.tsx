"use client";

import { useActionState } from "react";
import { Field } from "../../_components/Field";
import { LocalizedField } from "../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../_components/MediaPicker";
import { createPostAction, type PostActionState } from "./actions";

const initialState: PostActionState = {};

const emptyLocalized = { en: "", ar: "" };

export function CreatePostForm({ media }: { media: MediaOption[] }) {
  const [state, action, pending] = useActionState(createPostAction, initialState);

  return (
    <form
      action={action}
      data-testid="create-post-form"
      className="flex flex-col gap-4 rounded border border-[var(--color-ink)]/10 p-5"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Create journal post</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Slug" name="slug" placeholder="e.g. understanding-your-skin" required />
        <Field label="Author name" name="authorName" placeholder="e.g. Dr. Lina" />
      </div>
      <Field label="Order" name="order" type="number" placeholder="0" />

      <LocalizedField label="Title" name="title" defaultValue={emptyLocalized} required />
      <LocalizedField label="Excerpt" name="excerpt" type="textarea" defaultValue={emptyLocalized} />
      <LocalizedField label="Body" name="body" type="textarea" defaultValue={emptyLocalized} required />

      <MediaPicker label="Hero media" name="heroMediaId" media={media} />

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" name="isPublished" className="h-4 w-4" />
        Published (sets the publish date to now)
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create post"}
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
