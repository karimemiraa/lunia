"use client";

import { useActionState } from "react";
import { updateTierAction, deleteTierAction, type TierActionState } from "./actions";
import type { MembershipTier } from "@prisma/client";
import { ConfirmButton } from "../_ui/ConfirmDialog";

const initialState: TierActionState = {};

const inputClass = "lunia-input min-h-11 w-24 text-base md:text-sm";

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
          <button type="submit" form={formId} disabled={updatePending} aria-busy={updatePending || undefined} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-11 disabled:opacity-60">
            {updatePending ? "Saving…" : "Save"}
          </button>
          {updateState.error && (
            <p role="alert" className="text-xs text-red-600">
              {updateState.error}
            </p>
          )}
          {updateState.success && <p role="status" className="text-xs font-medium text-[var(--status-success-ink)]">Saved.</p>}
        </div>
      </td>
      <td className="px-4 py-2">
        {tier.isSystem ? (
          <span className="text-xs text-[var(--color-ink)]/45">System tier</span>
        ) : (
          <form action={deleteAction} className="flex flex-col items-start gap-1">
            <input type="hidden" name="id" value={tier.id} />
            <ConfirmButton title={`Delete tier “${tier.name}”?`} description="Customers on this tier fall back to the default tier. This cannot be undone." confirmLabel="Delete tier" pending={deletePending}>
              Delete
            </ConfirmButton>
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
