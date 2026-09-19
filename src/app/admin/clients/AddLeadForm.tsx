"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_components/Modal";
import { createLeadAction, type RosterActionState } from "./actions";

interface StaffOption {
  id: string;
  name: string;
}

const initial: RosterActionState = {};

// "Add lead" opens a popup so telesales can log someone they're reaching out to
// (outbound) or a new inbound enquiry, without leaving the roster.
export function AddLeadForm({ staff }: { staff: StaffOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createLeadAction, initial);

  useEffect(() => {
    if (state.success && open) {
      setOpen(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="lunia-btn lunia-btn-forest" data-testid="add-lead-trigger">
        Add lead
      </button>

      {open && (
        <Modal title="Add a lead" onClose={() => setOpen(false)}>
          <form action={action} className="flex flex-col gap-4" data-testid="add-lead-form">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Name</span>
                <input name="fullName" type="text" required maxLength={120} className="lunia-input" autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Phone</span>
                <input name="phone" type="tel" maxLength={40} className="lunia-input" autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Email (optional)</span>
                <input name="email" type="email" maxLength={200} className="lunia-input" autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Source</span>
                <input name="source" type="text" maxLength={80} placeholder="e.g. whatsapp campaign, cold call" className="lunia-input" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Channel</span>
                <select name="direction" defaultValue="OUTBOUND" className="lunia-input">
                  <option value="OUTBOUND">Outbound (we reached out)</option>
                  <option value="INBOUND">Inbound (they came to us)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">Assign to</span>
                <select name="ownerId" defaultValue="" className="lunia-input">
                  <option value="">Me</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-[var(--color-ink)]/45">A phone or email is required so you can reach them.</p>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest w-fit disabled:opacity-60">
                {pending ? "Adding…" : "Add lead"}
              </button>
              {state.error && <span role="alert" className="text-sm font-medium text-red-700">{state.error}</span>}
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
