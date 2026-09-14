"use client";
import { useActionState } from "react";
import { uploadMedia, type UploadState } from "./actions";

const initialState: UploadState = {};

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadMedia, initialState);

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-3 lunia-card p-5"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">Upload media</span>
        <input type="file" name="file" accept="image/*,video/*" required className="text-sm" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="lunia-btn lunia-btn-primary disabled:opacity-60"
      >
        {pending ? "Uploading…" : "Upload"}
      </button>
      {state?.error && (
        <p role="alert" className="w-full text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
