"use client";

import { useActionState } from "react";
import { Field } from "../../_components/Field";
import { LocalizedField } from "../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../_components/MediaPicker";
import { createPostAction, type PostActionState } from "./actions";
import { InlineStatus } from "../../_ui/Form";
import { useStaffT } from "../../_i18n/StaffI18n";

const initialState: PostActionState = {};

const emptyLocalized = { en: "", ar: "" };

export function CreatePostForm({ media }: { media: MediaOption[] }) {
  const [state, action, pending] = useActionState(createPostAction, initialState);
  const t = useStaffT();

  return (
    <form
      action={action}
      data-testid="create-post-form"
      className="flex flex-col gap-4 lunia-card p-5"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Create journal post")}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Slug")} name="slug" dir="ltr" placeholder={t("e.g. {example}", { example: "understanding-your-skin" })} required />
        <Field label={t("Author name")} name="authorName" placeholder={t("e.g. {example}", { example: "Dr. Lina" })} />
        <Field label={t("Author name (Arabic)")} name="authorNameAr" placeholder="مثال: د. لينا" dir="rtl" />
      </div>
      <Field label={t("Order")} name="order" type="number" placeholder="0" />

      <LocalizedField label={t("Title")} name="title" defaultValue={emptyLocalized} required />
      <LocalizedField label={t("Excerpt")} name="excerpt" type="textarea" defaultValue={emptyLocalized} />
      <LocalizedField label={t("Body")} name="body" type="textarea" defaultValue={emptyLocalized} required />

      <MediaPicker label={t("Hero media")} name="heroMediaId" media={media} />

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" name="isPublished" className="h-4 w-4" />
        {t("Published (sets the publish date to now)")}
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? t("Creating…") : t("Create post")}
        </button>
        <InlineStatus success={state.success ? t("Created.") : undefined} />
        <InlineStatus error={state.error} />
      </div>
    </form>
  );
}
