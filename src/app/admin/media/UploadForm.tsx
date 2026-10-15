"use client";
import { useActionState } from "react";
import { uploadMedia, type UploadState } from "./actions";
import { InlineStatus } from "../_ui/Form";
import { useStaffT } from "../_i18n/StaffI18n";

const initialState: UploadState = {};

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadMedia, initialState);
  const t = useStaffT();

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-3 lunia-card p-5"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">{t("Upload media")}</span>
        <input type="file" name="file" accept="image/*,video/*" required className="text-sm" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="lunia-btn lunia-btn-primary disabled:opacity-60"
      >
        {pending ? t("Uploading…") : t("Upload")}
      </button>
      <InlineStatus error={state?.error} className="w-full" />
    </form>
  );
}
