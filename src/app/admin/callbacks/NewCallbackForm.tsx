"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_components/Modal";
import { createCallbackAction, type CreateCallbackState } from "./actions";

const initial: CreateCallbackState = {};

const label = "text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55";

// Staff can queue a call-back by hand (e.g. someone asked at the desk or on
// Instagram). It's assigned to whoever adds it.
export function NewCallbackForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: CreateCallbackState | null, formData: FormData) => {
    const result = await createCallbackAction(prev, formData);
    if (result.success) {
      setOpen(false);
      router.refresh();
    }
    return result;
  }, initial);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="lunia-btn lunia-btn-forest min-h-11">
        Add call-back
      </button>
      {open && (
        <Modal title="Add a call-back" onClose={() => setOpen(false)}>
          <form action={action} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className={label}>Name</span>
                <input name="name" required maxLength={120} className="lunia-input" autoComplete="off" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className={label}>Phone</span>
                <input name="phone" type="tel" required maxLength={40} className="lunia-input" autoComplete="off" dir="ltr" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className={label}>Best time</span>
                <select name="preferredWindow" defaultValue="asap" className="lunia-input">
                  <option value="asap">As soon as possible</option>
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className={label}>Language</span>
                <select name="locale" defaultValue="ar" className="lunia-input">
                  <option value="ar">Arabic</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                <span className={label}>Topic</span>
                <input name="topic" maxLength={200} placeholder="e.g. hair loss, price question" className="lunia-input" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                <span className={label}>Notes</span>
                <textarea name="notes" maxLength={2000} rows={3} className="lunia-input" />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest min-h-11 w-fit disabled:opacity-60">
                {pending ? "Adding…" : "Add call-back"}
              </button>
              {state.error && (
                <span role="alert" className="text-sm font-medium text-red-700">
                  {state.error}
                </span>
              )}
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
