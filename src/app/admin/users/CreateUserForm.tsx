"use client";

import { useActionState, useRef } from "react";
import { createUserAction, type UserActionState } from "./actions";

interface RoleOption {
  id: string;
  name: string;
}

const initialState: UserActionState = {};

export function CreateUserForm({ roles }: { roles: RoleOption[] }) {
  const [state, action, pending] = useActionState(createUserAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await action(formData);
        formRef.current?.reset();
      }}
      data-testid="create-user-form"
      className="flex flex-col gap-4 lunia-card p-6"
    >
      <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">Add a team member</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">Name</span>
          <input name="fullName" type="text" required maxLength={120} className="lunia-input" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">Title (optional)</span>
          <input name="title" type="text" maxLength={120} className="lunia-input" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">Email</span>
          <input name="email" type="email" required maxLength={200} className="lunia-input" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">Temporary password</span>
          <input name="password" type="password" required minLength={8} maxLength={200} className="lunia-input" autoComplete="new-password" />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">Roles</legend>
        <div className="flex flex-wrap gap-2">
          {roles.map((role) => (
            <label
              key={role.id}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--color-ink)] transition-colors hover:bg-[var(--color-forest)]/5 has-[:checked]:border-[var(--color-forest)] has-[:checked]:bg-[var(--color-forest)]/10"
            >
              <input type="checkbox" name="roleIds" value={role.id} className="h-3.5 w-3.5 accent-[var(--color-forest)]" />
              {role.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest w-fit disabled:opacity-60">
          {pending ? "Adding…" : "Add team member"}
        </button>
        {state.success && <p className="text-sm font-medium text-[var(--color-teal-ink)]">Team member added.</p>}
        {state.error && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
