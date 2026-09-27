"use client";

import { useActionState } from "react";
import { closeCashSessionAction, openCashSessionAction, type CashFormState } from "./actions";

const label = "text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60";

function Feedback({ state }: { state: CashFormState | null }) {
  if (state?.error) {
    return (
      <p role="alert" className="text-sm text-[#b42318]">
        {state.error}
      </p>
    );
  }
  if (state?.message) {
    return (
      <p role="status" className="text-sm text-[var(--color-teal-ink)]">
        {state.message}
      </p>
    );
  }
  return null;
}

export function OpenSessionForm() {
  const [state, action, pending] = useActionState<CashFormState | null, FormData>(openCashSessionAction, null);
  return (
    <form action={action} className="lunia-card flex flex-col gap-4 p-5" data-testid="open-cash-form">
      <div>
        <h2 className="text-base font-semibold text-[var(--color-ink)]">Open the drawer</h2>
        <p className="text-sm text-[var(--color-ink)]/60">Count the float in the drawer before the first cash sale.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className={label}>Opening float (SAR)</span>
          <input name="float" inputMode="decimal" required defaultValue="0" className="lunia-input min-h-11 tabular-nums" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className={label}>Note (optional)</span>
          <input name="note" maxLength={300} className="lunia-input min-h-11" />
        </label>
      </div>
      <Feedback state={state} />
      <div>
        <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60">
          {pending ? "Opening…" : "Open drawer"}
        </button>
      </div>
    </form>
  );
}

export function CloseSessionForm({ sessionId, expectedLabel }: { sessionId: string; expectedLabel: string }) {
  const [state, action, pending] = useActionState<CashFormState | null, FormData>(closeCashSessionAction, null);
  return (
    <form action={action} className="lunia-card flex flex-col gap-4 p-5" data-testid="close-cash-form">
      <input type="hidden" name="sessionId" value={sessionId} />
      <div>
        <h2 className="text-base font-semibold text-[var(--color-ink)]">Close the drawer</h2>
        <p className="text-sm text-[var(--color-ink)]/60">Count every note and coin. The system expects {expectedLabel}.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className={label}>Counted cash (SAR)</span>
          <input name="counted" inputMode="decimal" required className="lunia-input min-h-11 tabular-nums" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className={label}>Note (optional)</span>
          <input name="note" maxLength={300} placeholder="Explain any difference" className="lunia-input min-h-11" />
        </label>
      </div>
      <Feedback state={state} />
      <div>
        <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60">
          {pending ? "Closing…" : "Count and close"}
        </button>
      </div>
    </form>
  );
}
