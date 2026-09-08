"use client";

import { useActionState } from "react";
import type { BlogPost } from "@prisma/client";
import { Field } from "../../../_components/Field";
import { LocalizedField, type LocalizedValue } from "../../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../../_components/MediaPicker";
import { updatePostAction, type PostActionState } from "../actions";

const initialState: PostActionState = {};

function pair(en: string, ar: string): LocalizedValue {
  return { en, ar };
}

interface EditPostFormProps {
  post: BlogPost;
  media: MediaOption[];
}

export function EditPostForm({ post, media }: EditPostFormProps) {
  const [state, action, pending] = useActionState(updatePostAction, initialState);

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <input type="hidden" name="id" value={post.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Slug</span>
          <span className="text-[var(--color-ink)]/70">{post.slug}</span>
        </div>
        <Field label="Author name" name="authorName" defaultValue={post.authorName ?? ""} />
      </div>
      <Field label="Order" name="order" type="number" defaultValue={String(post.order)} />

      <LocalizedField label="Title" name="title" defaultValue={pair(post.titleEn, post.titleAr)} required />
      <LocalizedField label="Excerpt" name="excerpt" type="textarea" defaultValue={pair(post.excerptEn, post.excerptAr)} />
      <LocalizedField label="Body" name="body" type="textarea" defaultValue={pair(post.bodyEn, post.bodyAr)} required />

      <MediaPicker label="Hero media" name="heroMediaId" media={media} defaultValue={post.heroMediaId} />

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" name="isPublished" defaultChecked={post.isPublished} className="h-4 w-4" />
        Published
      </label>
      {post.publishedAt && (
        <p className="text-xs text-[var(--color-ink)]/50">
          First published {new Date(post.publishedAt).toLocaleDateString()}.
        </p>
      )}

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
