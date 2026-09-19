"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../_components/Modal";
import { updateCustomerAction, deleteCustomerAction, type ClientActionState } from "./actions";
import { useActionState } from "react";

interface CustomerEditorProps {
  clientProfileId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  source: string | null;
}

const initialState: ClientActionState = {};

// "Edit details" opens a popup with the edit form + delete, so staff aren't
// scrolling past a big inline form on the profile.
export function CustomerEditor({ clientProfileId, fullName, phone, email, source }: CustomerEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saveState, saveAction, savePending] = useActionState(updateCustomerAction, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteCustomerAction, initialState);

  // Close + refresh once a save succeeds.
  useEffect(() => {
    if (saveState.success && open) {
      setOpen(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState.success]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="lunia-btn lunia-btn-forest-outline" data-testid="edit-customer-trigger">
        Edit details
      </button>

      {open && (
        <Modal title="Edit customer" onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-5" data-testid="customer-editor">
            <form action={saveAction} className="flex flex-col gap-4">
              <input type="hidden" name="clientProfileId" value={clientProfileId} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Name</span>
                  <input name="fullName" type="text" required maxLength={120} defaultValue={fullName} className="lunia-input" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Phone</span>
                  <input name="phone" type="tel" maxLength={40} defaultValue={phone ?? ""} className="lunia-input" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                  <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Email</span>
                  <input name="email" type="email" maxLength={200} defaultValue={email ?? ""} className="lunia-input" />
                </label>
              </div>
              <p className="text-xs text-[var(--color-ink)]/45">
                Source: <span className="font-medium text-[var(--color-ink)]/70">{source || "Not set"}</span> (set automatically)
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={savePending} className="lunia-btn lunia-btn-forest w-fit disabled:opacity-60">
                  {savePending ? "Saving…" : "Save details"}
                </button>
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
        </Modal>
      )}
    </>
  );
}
