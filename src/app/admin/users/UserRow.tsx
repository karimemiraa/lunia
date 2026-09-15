"use client";

import { useActionState } from "react";
import { setUserRolesAction, deleteUserAction, type UserActionState } from "./actions";
import type { StaffUserRow } from "@/modules/iam/users";

interface RoleOption {
  id: string;
  name: string;
}

const initialState: UserActionState = {};

export function UserRow({ user, roles, isSelf }: { user: StaffUserRow; roles: RoleOption[]; isSelf: boolean }) {
  const [roleState, roleAction, rolePending] = useActionState(setUserRolesAction, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteUserAction, initialState);

  return (
    <div className="lunia-card flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between" data-testid="user-row">
      <div className="min-w-0">
        <p className="font-medium text-[var(--color-ink)]">
          {user.fullName || "Unnamed"}
          {isSelf && <span className="ms-2 rounded-full bg-[var(--color-teal)]/20 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--color-teal-ink)]">You</span>}
        </p>
        <p className="text-sm text-[var(--color-ink)]/60">{user.email}</p>
        {user.title && <p className="text-xs text-[var(--color-ink)]/45">{user.title}</p>}
      </div>

      <div className="flex flex-col items-start gap-3 sm:items-end">
        {/* Role assignment */}
        <form action={roleAction} className="flex flex-col items-start gap-2 sm:items-end">
          <input type="hidden" name="userId" value={user.id} />
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {roles.map((role) => (
              <label
                key={role.id}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--color-ink)] transition-colors hover:bg-[var(--color-forest)]/5 has-[:checked]:border-[var(--color-forest)] has-[:checked]:bg-[var(--color-forest)]/10"
              >
                <input
                  type="checkbox"
                  name="roleIds"
                  value={role.id}
                  defaultChecked={user.roleIds.includes(role.id)}
                  className="h-3.5 w-3.5 accent-[var(--color-forest)]"
                />
                {role.name}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={rolePending} className="lunia-btn lunia-btn-forest lunia-btn-sm disabled:opacity-60">
              {rolePending ? "Saving…" : "Save roles"}
            </button>
            {roleState.success && <span className="text-xs font-medium text-[var(--color-teal-ink)]">Saved.</span>}
            {roleState.error && <span role="alert" className="text-xs font-medium text-red-700">{roleState.error}</span>}
          </div>
        </form>

        {/* Delete */}
        {!isSelf && (
          <form
            action={deleteAction}
            onSubmit={(e) => {
              if (!confirm(`Delete ${user.fullName || user.email}? This cannot be undone.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="userId" value={user.id} />
            <button type="submit" disabled={deletePending} className="lunia-btn lunia-btn-danger lunia-btn-sm disabled:opacity-60">
              {deletePending ? "Deleting…" : "Delete user"}
            </button>
            {deleteState.error && <span role="alert" className="ms-2 text-xs font-medium text-red-700">{deleteState.error}</span>}
          </form>
        )}
      </div>
    </div>
  );
}
