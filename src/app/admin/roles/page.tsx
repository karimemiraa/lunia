import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listRolesWithPermissions } from "@/modules/iam/roles";
import { RoleCard } from "./RoleCard";
import { CreateRoleForm } from "./CreateRoleForm";

export default async function RolesPage() {
  const user = await requireAdmin(PERMISSIONS.STAFF_MANAGE);
  const roles = await listRolesWithPermissions();

  return (
    <AdminShell
      user={user}
      title="Roles & permissions"
      description="Define what each role can do. Assign roles to team members from the Users page."
    >
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] bg-[var(--color-forest)] px-6 py-5 text-[var(--color-cream)] shadow-[var(--shadow-sm)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-teal)]">Access control</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl">
            {roles.length} role{roles.length === 1 ? "" : "s"}
          </p>
        </div>
        <CreateRoleForm />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="roles-list">
        {roles.map((role) => (
          <RoleCard key={role.id} role={role} />
        ))}
      </div>
    </AdminShell>
  );
}
