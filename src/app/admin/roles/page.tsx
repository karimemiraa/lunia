import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS, ALL_PERMISSION_KEYS } from "@/modules/iam/permissions";
import { listRolesWithPermissions } from "@/modules/iam/roles";
import { RoleRow } from "./RoleRow";
import { CreateRoleForm } from "./CreateRoleForm";

export default async function RolesPage() {
  const user = await requireAdmin(PERMISSIONS.STAFF_MANAGE);
  const roles = await listRolesWithPermissions();

  return (
    <AdminShell
      user={user}
      title="Roles & Permissions"
      description="Manage staff roles and the permissions granted to each one."
    >
      <div className="mb-8 max-w-xl">
        <CreateRoleForm />
      </div>

      <div className="overflow-x-auto rounded border border-[var(--color-ink)]/10">
        <table className="w-full text-left text-sm" data-testid="roles-table">
          <thead className="bg-[var(--color-cream)]/60">
            <tr>
              <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Role</th>
              {ALL_PERMISSION_KEYS.map((key) => (
                <th
                  key={key}
                  className="whitespace-nowrap px-2 py-2 text-center text-xs font-medium text-[var(--color-ink)]"
                >
                  {key}
                </th>
              ))}
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Save</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Delete</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <RoleRow key={role.id} role={role} permissionKeys={ALL_PERMISSION_KEYS} />
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
