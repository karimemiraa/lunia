"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_components/Modal";
import { saveRolePermissions, deleteRoleAction, type RoleActionState } from "./actions";
import type { RoleWithPermissions } from "@/modules/iam/roles";
import { PERMISSION_GROUPS, PERMISSION_LABELS } from "@/modules/iam/permissions";

const initial: RoleActionState = {};

export function RoleCard({ role }: { role: RoleWithPermissions }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saveState, saveAction, savePending] = useActionState(saveRolePermissions, initial);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteRoleAction, initial);

  useEffect(() => {
    if (saveState.success && open) {
      setOpen(false);
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveState.success]);

  const count = role.permissionKeys.length;
  const isFull = count === Object.keys(PERMISSION_LABELS).length;

  return (
    <div className="flex flex-col gap-3 lunia-card p-5" data-testid="role-row" data-role-key={role.key}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">{role.name}</p>
          <p className="text-xs text-[var(--color-ink)]/50">
            {isFull ? "Full access" : `${count} permission${count === 1 ? "" : "s"}`}
            {role.isSystem && " · system"}
          </p>
        </div>
      </div>

      {/* Permission chips preview */}
      <div className="flex flex-wrap gap-1.5">
        {isFull ? (
          <span className="rounded-full bg-[var(--color-forest)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--color-forest)]">
            Everything
          </span>
        ) : count === 0 ? (
          <span className="text-xs text-[var(--color-ink)]/40">No permissions yet</span>
        ) : (
          role.permissionKeys.slice(0, 5).map((k) => (
            <span key={k} className="rounded-full bg-[var(--color-ink)]/[0.06] px-2.5 py-0.5 text-xs text-[var(--color-ink)]/70">
              {PERMISSION_LABELS[k]?.split(" (")[0] ?? k}
            </span>
          ))
        )}
        {!isFull && count > 5 && <span className="text-xs text-[var(--color-ink)]/45">+{count - 5} more</span>}
      </div>

      <div className="mt-1 flex items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm">
          Edit permissions
        </button>
        {!role.isSystem && (
          <form
            action={deleteAction}
            onSubmit={(e) => {
              if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) e.preventDefault();
            }}
          >
            <input type="hidden" name="roleId" value={role.id} />
            <button type="submit" disabled={deletePending} className="lunia-btn lunia-btn-danger lunia-btn-sm disabled:opacity-60">
              {deletePending ? "Deleting…" : "Delete"}
            </button>
          </form>
        )}
        {deleteState.error && <span role="alert" className="text-xs text-red-700">{deleteState.error}</span>}
      </div>

      {open && (
        <Modal title={`Edit ${role.name}`} onClose={() => setOpen(false)}>
          <form action={saveAction} className="flex flex-col gap-5">
            <input type="hidden" name="roleId" value={role.id} />
            {PERMISSION_GROUPS.map((group) => (
              <fieldset key={group.label} className="flex flex-col gap-2">
                <legend className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]/55">{group.label}</legend>
                <div className="flex flex-col gap-2">
                  {group.keys.map((key) => (
                    <label key={key} className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--line)] px-3 py-2 text-sm transition-colors has-[:checked]:border-[var(--color-forest)] has-[:checked]:bg-[var(--color-forest)]/5">
                      <input type="checkbox" name="permissions" value={key} defaultChecked={role.permissionKeys.includes(key)} className="h-4 w-4 accent-[var(--color-forest)]" />
                      <span className="text-[var(--color-ink)]">{PERMISSION_LABELS[key]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={savePending} className="lunia-btn lunia-btn-forest w-fit disabled:opacity-60">
                {savePending ? "Saving…" : "Save permissions"}
              </button>
              {saveState.error && <span role="alert" className="text-sm font-medium text-red-700">{saveState.error}</span>}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
