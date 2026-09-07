"use client";

import { useActionState } from "react";
import { saveRolePermissions, deleteRoleAction, type RoleActionState } from "./actions";
import type { RoleWithPermissions } from "@/modules/iam/roles";
import type { PermissionKey } from "@/modules/iam/permissions";

const initialState: RoleActionState = {};

interface RoleRowProps {
  role: RoleWithPermissions;
  permissionKeys: PermissionKey[];
}

// Renders one matrix row: a checkbox per permission plus Save/Delete. The
// checkboxes live in their own <td>s but are wired to the row's <form> via
// the HTML `form` attribute (valid HTML5) so the table structure stays a
// plain table while a single field-set backs each row's Save action.
export function RoleRow({ role, permissionKeys }: RoleRowProps) {
  const [saveState, saveAction, savePending] = useActionState(saveRolePermissions, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteRoleAction, initialState);
  const formId = `role-permissions-${role.id}`;

  return (
    <tr className="border-t border-[var(--color-ink)]/10" data-testid="role-row" data-role-key={role.key}>
      <td className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">
        {role.name}
        {role.isSystem && <span className="ml-2 text-xs font-normal text-[var(--color-ink)]/50">(system)</span>}
      </td>
      {permissionKeys.map((key) => (
        <td key={key} className="px-2 py-2 text-center">
          <input
            type="checkbox"
            form={formId}
            name="permissions"
            value={key}
            defaultChecked={role.permissionKeys.includes(key)}
            aria-label={`${role.name}: ${key}`}
          />
        </td>
      ))}
      <td className="px-4 py-2">
        <form id={formId} action={saveAction} className="flex flex-col items-start gap-1">
          <input type="hidden" name="roleId" value={role.id} />
          <button
            type="submit"
            disabled={savePending}
            className="rounded bg-[var(--color-teal)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {savePending ? "Saving…" : "Save"}
          </button>
          {saveState.error && (
            <p role="alert" className="text-xs text-red-600">
              {saveState.error}
            </p>
          )}
          {saveState.success && <p className="text-xs text-[var(--color-teal)]">Saved.</p>}
        </form>
      </td>
      <td className="px-4 py-2">
        {role.isSystem ? (
          <button
            type="button"
            disabled
            title="System roles cannot be deleted"
            className="rounded border border-[var(--color-ink)]/20 px-3 py-1.5 text-xs text-[var(--color-ink)]/40"
          >
            Delete
          </button>
        ) : (
          <form
            action={deleteAction}
            onSubmit={(event) => {
              if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) {
                event.preventDefault();
              }
            }}
            className="flex flex-col items-start gap-1"
          >
            <input type="hidden" name="roleId" value={role.id} />
            <button
              type="submit"
              disabled={deletePending}
              className="rounded border border-red-600/30 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {deletePending ? "Deleting…" : "Delete"}
            </button>
            {deleteState.error && (
              <p role="alert" className="text-xs text-red-600">
                {deleteState.error}
              </p>
            )}
          </form>
        )}
      </td>
    </tr>
  );
}
