"use client";

import { useActionState, useId, useRef } from "react";
import { issueGiftCardAction, type CommerceActionState } from "./actions";

interface ClientOption {
  clientProfileId: string;
  fullName: string;
  phone: string | null;
}

const initialState: CommerceActionState = {};

const inputClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

/** Issues a new gift card -- amount (SAR), optional recipient client, optional expiry. Guarded by SETTINGS_MANAGE server-side. */
export function IssueGiftCardForm({ clients }: { clients: ClientOption[] }) {
  const [state, action, pending] = useActionState(issueGiftCardAction, initialState);
  const amountId = useId();
  const clientId = useId();
  const expiryId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
      }}
      data-testid="issue-giftcard-form"
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label htmlFor={amountId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Amount (SAR)</span>
          <input id={amountId} name="amountSar" type="number" min={1} step="0.01" required className={inputClass} />
        </label>

        <label htmlFor={clientId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Client (optional)</span>
          <select id={clientId} name="clientProfileId" defaultValue="" className={inputClass}>
            <option value="">Unassigned</option>
            {clients.map((client) => (
              <option key={client.clientProfileId} value={client.clientProfileId}>
                {client.fullName}
                {client.phone ? ` — ${client.phone}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor={expiryId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Expires (optional)</span>
          <input id={expiryId} name="expiresAt" type="date" className={inputClass} />
        </label>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? "Issuing…" : "Issue gift card"}
        </button>
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </div>

      {state.success && state.issuedCode && (
        <p className="rounded border border-[var(--color-teal)]/30 bg-[var(--color-teal)]/10 px-4 py-3 text-sm text-[var(--color-ink)]" data-testid="issued-giftcard-code">
          Gift card issued: <span className="font-mono font-semibold">{state.issuedCode}</span> — share this code with the recipient.
        </p>
      )}
    </form>
  );
}
