"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_components/Modal";
import { ConfirmButton } from "../_ui/ConfirmDialog";
import { saveRolePermissions, deleteRoleAction, type RoleActionState } from "./actions";
import type { RoleWithPermissions } from "@/modules/iam/roles";
import { PERMISSION_GROUPS, PERMISSION_LABELS, ALL_PERMISSION_KEYS } from "@/modules/iam/permissions";
import { onActionSuccess } from "../_components/onActionSuccess";
import { InlineStatus } from "../_ui/Form";
import { useStaffLocale, useStaffT } from "../_i18n/StaffI18n";
import { translateIn } from "../_i18n/t";

const initial: RoleActionState = {};

export function RoleCard({ role }: { role: RoleWithPermissions }) {
  const t = useStaffT();
  const locale = useStaffLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saveState, saveAction, savePending] = useActionState(
    onActionSuccess(saveRolePermissions, () => {
      setOpen(false);
      router.refresh();
    }),
    initial,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(deleteRoleAction, initial);


  // Count only assignable (editor-visible) permissions; the owner-only
  // platform:manage grant is excluded from ALL_PERMISSION_KEYS.
  const count = role.permissionKeys.filter((k) => (ALL_PERMISSION_KEYS as string[]).includes(k)).length;
  const isFull = count >= ALL_PERMISSION_KEYS.length;

  return (
    <div className="flex flex-col gap-3 lunia-card p-5" data-testid="role-row" data-role-key={role.key}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">{translateIn(role.name, "role", locale)}</p>
          <p className="text-xs text-[var(--color-ink)]/50">
            {isFull ? t("Full access") : t(count === 1 ? "{count} permission" : "{count} permissions", { count })}
            {role.isSystem && ` · ${t("system")}`}
          </p>
        </div>
      </div>

      {/* Permission chips preview */}
      <div className="flex flex-wrap gap-1.5">
        {isFull ? (
          <span className="rounded-full bg-[var(--color-forest)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--color-forest)]">
            {t("Everything")}
          </span>
        ) : count === 0 ? (
          <span className="text-xs text-[var(--color-ink)]/40">{t("No permissions yet")}</span>
        ) : (
          role.permissionKeys.slice(0, 5).map((k) => (
            <span key={k} className="rounded-full bg-[var(--color-ink)]/[0.06] px-2.5 py-0.5 text-xs text-[var(--color-ink)]/70">
              {PERMISSION_LABELS[k] ? t(PERMISSION_LABELS[k]).split(" (")[0] : k}
            </span>
          ))
        )}
        {!isFull && count > 5 && <span className="text-xs text-[var(--color-ink)]/45">{t("+{count} more", { count: count - 5 })}</span>}
      </div>

      <div className="mt-1 flex items-center gap-2">
        <button type="button" onClick={() => setOpen(true)} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-11">
          {t("Edit permissions")}
        </button>
        {!role.isSystem && (
          <form action={deleteAction}>
            <input type="hidden" name="roleId" value={role.id} />
            <ConfirmButton
              title={t("Delete role “{name}”?", { name: role.name })}
              description={t("Staff with only this role lose access until another role is assigned. This cannot be undone.")}
              confirmLabel={t("Delete role")}
              pending={deletePending}
            >
              {t("Delete")}
            </ConfirmButton>
          </form>
        )}
        <InlineStatus size="sm" error={deleteState.error} />
      </div>

      {open && (
        <Modal title={t("Edit {name}", { name: role.name })} onClose={() => setOpen(false)}>
          {/* Keyed on the saved permissions: if the popup is reopened before the
              post-save refresh lands, the form remounts with fresh defaults once it does. */}
          <form key={role.permissionKeys.join(",")} action={saveAction} className="flex flex-col gap-5">
            <input type="hidden" name="roleId" value={role.id} />
            {PERMISSION_GROUPS.map((group) => (
              <fieldset key={group.label} className="flex flex-col gap-2">
                <legend className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]/55">{t(group.label)}</legend>
                <div className="flex flex-col gap-2">
                  {group.keys.map((key) => (
                    <label key={key} className="flex min-h-11 items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--line)] px-3 py-2 text-sm transition-colors has-[:checked]:border-[var(--color-forest)] has-[:checked]:bg-[var(--color-forest)]/5">
                      <input type="checkbox" name="permissions" value={key} defaultChecked={role.permissionKeys.includes(key)} className="h-5 w-5 accent-[var(--color-forest)]" />
                      <span className="text-[var(--color-ink)]">{t(PERMISSION_LABELS[key])}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={savePending} aria-busy={savePending || undefined} className="lunia-btn lunia-btn-forest min-h-11 w-fit disabled:opacity-60">
                {savePending ? t("Saving…") : t("Save permissions")}
              </button>
              <InlineStatus size="sm" error={saveState.error} />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
