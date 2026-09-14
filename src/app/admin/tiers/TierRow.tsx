"use client";

import { useActionState } from "react";
import { updateTierAction, deleteTierAction, type TierActionState } from "./actions";
import type { MembershipTier } from "@prisma/client";

const initialState: TierActionState = {};

const inputClass =
  "w-24 rounded border border-[var(--color-ink)]/20 px-2 py-1 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

// The Name/Priority/Discount inputs are spread across separate <td>s but all
// point at the same <form> via the HTML `form` attribute (valid HTML5), so a
// single Save action reads the whole row while the markup stays a plain
// table row.
export function TierRow({ tier }: { tier: MembershipTier }) {
  const [updateState, updateAction, updatePending] = useActionState(updateTierAction, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteTierAction, initialState);
  const formId = `tier-form-${tier.id}`;

  return (
    <tr className="border-t border-[var(--color-ink)]/10" data-testid="tier-row" data-tier-key={tier.key}>
      <td className="whitespace-nowrap px-4 py-2 text-[var(--color-ink)]">{tier.key}</td>
      <td className="px-4 py-2">
        <form id={formId} action={updateAction}>
          <input type="hidden" name="id" value={tier.id} />
          <input
            type="text"
            name="name"
            defaultValue={tier.name}
            aria-label={`${tier.key} name`}
            className={`${inputClass} w-40`}
          />
        </form>
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          name="priority"
          form={formId}
          defaultValue={tier.priority}
          aria-label={`${tier.key} priority`}
          className={inputClass}
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="number"
          name="discountPct"
          form={formId}
          defaultValue={tier.discountPct}
          aria-label={`${tier.key} discount percent`}
          className={inputClass}
        />
      </td>
      <td className="px-4 py-2 text-[var(--color-ink)]">{tier.isSystem ? "Yes" : "No"}</td>
      <td className="px-4 py-2">
        <div className="flex flex-col items-start gap-1">
          <button
            type="submit"
            form={formId}
            disabled={updatePending}
            className="lunia-btn lunia-btn-primary lunia-btn-sm disabled:opacity-60"
          >
            {updatePending ? "Saving…" : "Save"}
          </button>
          {updateState.error && (
            <p role="alert" className="text-xs text-red-600">
              {updateState.error}
            </p>
          )}
          {updateState.success && <p className="text-xs text-[var(--color-teal)]">Saved.</p>}
        </div>
      </td>
      <td className="px-4 py-2">
        {tier.isSystem ? (
          <button
            type="button"
            disabled
            title="System tiers cannot be deleted"
            className="rounded border border-[var(--color-ink)]/20 px-3 py-1.5 text-xs text-[var(--color-ink)]/40"
          >
            Delete
          </button>
        ) : (
          <form
            action={deleteAction}
            onSubmit={(event) => {
              if (!confirm(`Delete tier "${tier.name}"? This cannot be undone.`)) {
                event.preventDefault();
              }
            }}
            className="flex flex-col items-start gap-1"
          >
            <input type="hidden" name="id" value={tier.id} />
            <button
              type="submit"
              disabled={deletePending}
              className="lunia-btn lunia-btn-danger lunia-btn-sm disabled:opacity-60"
            >
              {deletePending ? "Deleting…" : "Delete"}
            </button>
            {deleteState.error && (
              <p role="alert" className="text-xs text-red-600">
                {deleteState.error}
              </p>
            )}
          </form>
        )}
      </td>
    </tr>
  );
}
