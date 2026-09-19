"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_components/Modal";
import { Field } from "../_components/Field";
import { createRoleAction, type RoleActionState } from "./actions";

const initialState: RoleActionState = {};

export function CreateRoleForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(createRoleAction, initialState);

  useEffect(() => {
    if (state.success && open) {
      setOpen(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lunia-btn bg-[var(--color-cream)] text-[var(--color-forest)] hover:bg-white"
        data-testid="create-role-trigger"
      >
        Create role
      </button>

      {open && (
        <Modal title="Create a role" onClose={() => setOpen(false)}>
          <form action={action} data-testid="create-role-form" className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Key" name="key" placeholder="e.g. front-desk" required />
              <Field label="Name" name="name" placeholder="e.g. Front Desk" required />
            </div>
            <p className="text-xs text-[var(--color-ink)]/45">The key is a lowercase identifier (letters, digits, hyphens). You set permissions after creating it.</p>
            <div className="flex items-center gap-3">
              <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest w-fit disabled:opacity-60">
                {pending ? "Creating…" : "Create role"}
              </button>
              {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
