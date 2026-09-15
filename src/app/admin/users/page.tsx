import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { prisma } from "@/lib/db";
import { listStaffUsers } from "@/modules/iam/users";
import { CreateUserForm } from "./CreateUserForm";
import { UserRow } from "./UserRow";

export default async function UsersPage() {
  const admin = await requireAdmin(PERMISSIONS.STAFF_MANAGE);

  const [users, roles] = await Promise.all([
    listStaffUsers(),
    // Assignable staff roles — the "client" role is for customers, not staff.
    prisma.role.findMany({ where: { key: { not: "client" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <AdminShell user={admin} title="Users" description="Add or remove team members and assign their roles.">
      <div className="mb-8 flex items-center justify-between gap-4 rounded-[var(--radius-lg)] bg-[var(--color-forest)] px-6 py-5 text-[var(--color-cream)] shadow-[var(--shadow-sm)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-teal)]">Team</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl">
            {users.length} team member{users.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="mb-8 max-w-2xl">
        <CreateUserForm roles={roles} />
      </div>

      <div className="flex flex-col gap-3" data-testid="users-list">
        {users.map((u) => (
          <UserRow key={u.id} user={u} roles={roles} isSelf={u.id === admin.id} />
        ))}
      </div>
    </AdminShell>
  );
}
