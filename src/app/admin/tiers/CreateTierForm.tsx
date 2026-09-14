"use client";

import { useActionState } from "react";
import { Field } from "../_components/Field";
import { createTierAction, type TierActionState } from "./actions";

const initialState: TierActionState = {};

export function CreateTierForm() {
  const [state, action, pending] = useActionState(createTierAction, initialState);

  return (
    <form
      action={action}
      data-testid="create-tier-form"
      className="flex flex-col gap-4 lunia-card p-5"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Create tier</h2>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Key" name="key" placeholder="e.g. gold" required />
        <Field label="Name" name="name" placeholder="e.g. Gold" required />
        <Field label="Priority" name="priority" type="number" placeholder="0" />
        <Field label="Discount %" name="discountPct" type="number" placeholder="0" />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create tier"}
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
