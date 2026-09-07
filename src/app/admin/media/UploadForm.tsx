"use client";
import { useActionState } from "react";
import { uploadMedia, type UploadState } from "./actions";

const initialState: UploadState = {};

export function UploadForm() {
  const [state, action, pending] = useActionState(uploadMedia, initialState);

  return (
    <form
      action={action}
      className="flex flex-wrap items-end gap-3 rounded border border-[var(--color-ink)]/10 p-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">Upload media</span>
        <input type="file" name="file" accept="image/*,video/*" required className="text-sm" />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
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
