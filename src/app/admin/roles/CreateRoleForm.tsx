"use client";

import { useActionState } from "react";
import { Field } from "../_components/Field";
import { createRoleAction, type RoleActionState } from "./actions";

const initialState: RoleActionState = {};

export function CreateRoleForm() {
  const [state, action, pending] = useActionState(createRoleAction, initialState);

  return (
    <form
      action={action}
      data-testid="create-role-form"
      className="flex flex-col gap-4 rounded border border-[var(--color-ink)]/10 p-5"
    >
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Create role</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Key" name="key" placeholder="e.g. front-desk" required />
        <Field label="Name" name="name" placeholder="e.g. Front Desk" required />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create role"}
        </button>
        {state.success && <p className="text-sm text-[var(--color-teal)]">Created.</p>}
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
