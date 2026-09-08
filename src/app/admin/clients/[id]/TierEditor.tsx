"use client";

import { useActionState, useId } from "react";
import { updateTierAction, type ClientActionState } from "./actions";
import type { MembershipTier } from "@prisma/client";

interface TierEditorProps {
  clientProfileId: string;
  currentTierId: string | null;
  tiers: MembershipTier[];
}

const initialState: ClientActionState = {};

const selectClass =
  "rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

// Only rendered when the current admin holds CLIENT_MANAGE (see
// [id]/page.tsx) -- updateTierAction re-checks that permission itself
// regardless, so this component never has to be trusted as the sole gate.
export function TierEditor({ clientProfileId, currentTierId, tiers }: TierEditorProps) {
  const [state, action, pending] = useActionState(updateTierAction, initialState);
  const selectId = useId();

  return (
    <form action={action} className="flex flex-wrap items-end gap-3" data-testid="tier-editor">
      <input type="hidden" name="clientProfileId" value={clientProfileId} />
      <label htmlFor={selectId} className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">Membership tier</span>
        <select id={selectId} name="tierId" defaultValue={currentTierId ?? ""} className={selectClass}>
          <option value="">No tier (guest)</option>
          {tiers.map((tier) => (
            <option key={tier.id} value={tier.id}>
              {tier.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save tier"}
      </button>
      {state.success && <p className="text-sm text-[var(--color-teal)]">Saved.</p>}
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
