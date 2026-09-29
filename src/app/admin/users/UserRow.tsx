"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setUserRolesAction, deleteUserAction, type UserActionState } from "./actions";
import type { StaffUserRow } from "@/modules/iam/users";
import { ConfirmButton } from "../_ui/ConfirmDialog";

interface RoleOption {
  id: string;
  name: string;
}

const initialState: UserActionState = {};

export function UserRow({
  user,
  roles,
  isSelf,
  canViewHr = false,
}: {
  user: StaffUserRow;
  roles: RoleOption[];
  isSelf: boolean;
  canViewHr?: boolean;
}) {
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
        {canViewHr && (
          <Link
            href={`/admin/hr/${user.id}`}
            className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-[var(--color-teal-ink)] underline-offset-4 hover:underline"
          >
            Employee file
          </Link>
        )}
      </div>

      <div className="flex flex-col items-start gap-3 sm:items-end">
        {/* Role assignment */}
        <form action={roleAction} className="flex flex-col items-start gap-2 sm:items-end">
          <input type="hidden" name="userId" value={user.id} />
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {roles.map((role) => (
              <label
                key={role.id}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-sm text-[var(--color-ink)] transition-colors hover:bg-[var(--color-forest)]/5 has-[:checked]:border-[var(--color-forest)] has-[:checked]:bg-[var(--color-forest)]/10"
              >
                <input
                  type="checkbox"
                  name="roleIds"
                  value={role.id}
                  defaultChecked={user.roleIds.includes(role.id)}
                  className="h-4 w-4 accent-[var(--color-forest)]"
                />
                {role.name}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={rolePending} aria-busy={rolePending || undefined} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-11 disabled:opacity-60">
              {rolePending ? "Saving…" : "Save roles"}
            </button>
            {roleState.success && <span role="status" className="text-xs font-medium text-[var(--status-success-ink)]">Saved.</span>}
            {roleState.error && <span role="alert" className="text-xs font-medium text-[var(--status-danger-ink)]">{roleState.error}</span>}
          </div>
        </form>

        {/* Delete */}
        {!isSelf && (
          <form action={deleteAction}>
            <input type="hidden" name="userId" value={user.id} />
            <ConfirmButton title={`Delete ${user.fullName || user.email}?`} description="They lose access to the staff system immediately. Their history (bookings, invoices, notes) stays. This cannot be undone." confirmLabel="Delete user" pending={deletePending}>
              Delete user
            </ConfirmButton>
            {deleteState.error && <span role="alert" className="ms-2 text-xs font-medium text-[var(--status-danger-ink)]">{deleteState.error}</span>}
          </form>
        )}
      </div>
    </div>
  );
}
