"use client";

import { useActionState, useId, useRef } from "react";
import { issueGiftCardAction, type CommerceActionState } from "./actions";
import { InlineStatus } from "../_ui/Form";
import { useStaffT } from "../_i18n/StaffI18n";

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
  const t = useStaffT();

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
          <span className="font-medium text-[var(--color-ink)]">{t("Amount (SAR)")}</span>
          <input id={amountId} dir="ltr" name="amountSar" type="number" min={1} step="0.01" required className={inputClass} />
        </label>

        <label htmlFor={clientId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Customer (optional)")}</span>
          <select id={clientId} name="clientProfileId" defaultValue="" className={inputClass}>
            <option value="">{t("Unassigned")}</option>
            {clients.map((client) => (
              <option key={client.clientProfileId} value={client.clientProfileId}>
                {client.fullName}
                {client.phone ? ` (${client.phone})` : ""}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor={expiryId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Expires (optional)")}</span>
          <input id={expiryId} name="expiresAt" type="date" className={inputClass} />
        </label>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? t("Issuing…") : t("Issue gift card")}
        </button>
        <InlineStatus error={state.error} />
      </div>

      {state.success && state.issuedCode && (
        <p className="rounded border border-[var(--color-teal)]/30 bg-[var(--color-teal)]/10 px-4 py-3 text-sm text-[var(--color-ink)]" data-testid="issued-giftcard-code">
          {t("Gift card issued:")} <span dir="ltr" className="font-mono font-semibold">{state.issuedCode}</span>. {t("Share this code with the recipient.")}
        </p>
      )}
    </form>
  );
}
