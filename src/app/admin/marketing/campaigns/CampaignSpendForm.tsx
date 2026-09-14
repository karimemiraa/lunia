"use client";

import { useActionState } from "react";
import { Field } from "../../_components/Field";
import { upsertCampaignSpendAction, type CampaignSpendActionState } from "./actions";

const initialState: CampaignSpendActionState = {};

// Upserts a CampaignSpend row keyed by (channel, periodMonth): submitting the
// same channel + month again overwrites that month's spend rather than
// creating a duplicate row, matching campaigns.ts's upsert semantics.
export function CampaignSpendForm() {
  const [state, action, pending] = useActionState(upsertCampaignSpendAction, initialState);

  return (
    <form
      action={action}
      data-testid="campaign-spend-form"
      className="flex flex-col gap-4 lunia-card p-5"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Add / update spend</h2>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Channel" name="channel" placeholder="e.g. instagram" required />
        <Field label="Period Month" name="periodMonth" placeholder="YYYY-MM" required />
        <Field label="Amount (SAR)" name="amountSar" type="number" step="0.01" placeholder="0.00" required />
        <Field label="Note" name="note" placeholder="Optional" />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save spend"}
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
