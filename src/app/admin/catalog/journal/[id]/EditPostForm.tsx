"use client";

import { useActionState } from "react";
import type { BlogPost } from "@prisma/client";
import { Field } from "../../../_components/Field";
import { LocalizedField, type LocalizedValue } from "../../../_components/LocalizedField";
import { MediaPicker, type MediaOption } from "../../../_components/MediaPicker";
import { updatePostAction, type PostActionState } from "../actions";
import { InlineStatus } from "../../../_ui/Form";
import { intlLocale } from "../../../_i18n/t";
import { useStaffLocale, useStaffT } from "../../../_i18n/StaffI18n";

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
  const t = useStaffT();
  const locale = useStaffLocale();

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      <input type="hidden" name="id" value={post.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Slug")}</span>
          <span className="text-[var(--color-ink)]/70" dir="ltr">{post.slug}</span>
        </div>
        <Field label={t("Author name")} name="authorName" defaultValue={post.authorName ?? ""} />
        <Field label={t("Author name (Arabic)")} name="authorNameAr" defaultValue={post.authorNameAr ?? ""} dir="rtl" />
      </div>
      <Field label={t("Order")} name="order" type="number" defaultValue={String(post.order)} />

      <LocalizedField label={t("Title")} name="title" defaultValue={pair(post.titleEn, post.titleAr)} required />
      <LocalizedField label={t("Excerpt")} name="excerpt" type="textarea" defaultValue={pair(post.excerptEn, post.excerptAr)} />
      <LocalizedField label={t("Body")} name="body" type="textarea" defaultValue={pair(post.bodyEn, post.bodyAr)} required />

      <MediaPicker label={t("Hero media")} name="heroMediaId" media={media} defaultValue={post.heroMediaId} />

      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" name="isPublished" defaultChecked={post.isPublished} className="h-4 w-4" />
        {t("Published")}
      </label>
      {post.publishedAt && (
        <p className="text-xs text-[var(--color-ink)]/50">
          {t("First published {date}.", { date: new Date(post.publishedAt).toLocaleDateString(intlLocale(locale, "en-US"), { timeZone: "Asia/Riyadh" }) })}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? t("Saving…") : t("Save")}
        </button>
        <InlineStatus success={state.success ? t("Saved.") : undefined} />
        <InlineStatus error={state.error} />
      </div>
    </form>
  );
}
