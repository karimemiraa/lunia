"use client";

import { useActionState } from "react";
import { updateCustomerAction, deleteCustomerAction, type ClientActionState } from "./actions";

interface CustomerEditorProps {
  clientProfileId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  source: string | null;
}

const initialState: ClientActionState = {};

export function CustomerEditor({ clientProfileId, fullName, phone, email, source }: CustomerEditorProps) {
  const [saveState, saveAction, savePending] = useActionState(updateCustomerAction, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteCustomerAction, initialState);

  return (
    <div className="flex flex-col gap-5 lunia-card p-5" data-testid="customer-editor">
      <form action={saveAction} className="flex flex-col gap-4">
        <input type="hidden" name="clientProfileId" value={clientProfileId} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Name</span>
            <input name="fullName" type="text" required maxLength={120} defaultValue={fullName} className="lunia-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Source</span>
            <input name="source" type="text" maxLength={80} defaultValue={source ?? ""} placeholder="e.g. instagram" className="lunia-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Phone</span>
            <input name="phone" type="tel" maxLength={40} defaultValue={phone ?? ""} className="lunia-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Email</span>
            <input name="email" type="email" maxLength={200} defaultValue={email ?? ""} className="lunia-input" />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={savePending} className="lunia-btn lunia-btn-forest w-fit disabled:opacity-60">
            {savePending ? "Saving…" : "Save details"}
          </button>
          {saveState.success && <span className="text-sm font-medium text-[var(--color-teal-ink)]">Saved.</span>}
          {saveState.error && <span role="alert" className="text-sm font-medium text-red-700">{saveState.error}</span>}
        </div>
      </form>

      <hr className="border-[var(--line)]" />

      <form
        action={deleteAction}
        onSubmit={(e) => {
          if (!confirm("Delete this customer and all their bookings and history? This cannot be undone.")) e.preventDefault();
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <input type="hidden" name="clientProfileId" value={clientProfileId} />
        <button type="submit" disabled={deletePending} className="lunia-btn lunia-btn-danger lunia-btn-sm disabled:opacity-60">
          {deletePending ? "Deleting…" : "Delete customer"}
        </button>
        <span className="text-xs text-[var(--color-ink)]/50">Removes the customer and their entire history permanently.</span>
        {deleteState.error && <span role="alert" className="text-sm font-medium text-red-700">{deleteState.error}</span>}
      </form>
    </div>
  );
}
