"use client";

import { useActionState } from "react";
import type { FormState } from "../_components/ActionForm";

// Approve / reject with an optional note. Two submit buttons share one form so
// the note travels with whichever decision is clicked.
export function DecisionForm({ action }: { action: (prev: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input name="note" maxLength={300} placeholder="Note (optional)" aria-label="Decision note" className="lunia-input min-h-11 sm:max-w-xs" />
      <div className="flex gap-2">
        <button type="submit" name="decision" value="APPROVED" disabled={pending} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60">
          Approve
        </button>
        <button type="submit" name="decision" value="REJECTED" disabled={pending} className="lunia-btn lunia-btn-ghost min-h-11 disabled:opacity-60">
          Reject
        </button>
      </div>
      {state.error && (
        <span role="alert" className="text-sm font-medium text-red-700">
          {state.error}
        </span>
      )}
      {state.success && <span className="text-sm font-medium text-[var(--color-teal-ink)]">{state.success}</span>}
    </form>
  );
}
