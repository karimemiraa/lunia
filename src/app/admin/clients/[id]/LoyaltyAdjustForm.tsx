"use client";

import { useActionState, useId, useRef } from "react";
import { adjustLoyaltyPointsAction, type ClientActionState } from "./actions";

interface LoyaltyAdjustFormProps {
  clientProfileId: string;
}

const initialState: ClientActionState = {};

const inputClass =
  "rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

// Only rendered when the current admin holds CLIENT_MANAGE (see
// [id]/page.tsx) -- adjustLoyaltyPointsAction re-checks that permission
// itself regardless, mirroring TierEditor/NotificationPreferenceEditor.
export function LoyaltyAdjustForm({ clientProfileId }: LoyaltyAdjustFormProps) {
  const [state, action, pending] = useActionState(adjustLoyaltyPointsAction, initialState);
  const pointsId = useId();
  const reasonId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      data-testid="loyalty-adjust-form"
      className="flex flex-wrap items-end gap-3 rounded border border-[var(--color-ink)]/10 p-4"
    >
      <input type="hidden" name="clientProfileId" value={clientProfileId} />
      <label htmlFor={pointsId} className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">Points (+/-)</span>
        <input
          id={pointsId}
          name="deltaPoints"
          type="number"
          step={1}
          required
          placeholder="e.g. 100 or -50"
          className={`${inputClass} w-36`}
        />
      </label>
      <label htmlFor={reasonId} className="flex flex-1 min-w-[12rem] flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">Reason</span>
        <input id={reasonId} name="reason" type="text" required placeholder="e.g. Goodwill credit" className={inputClass} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Apply adjustment"}
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
