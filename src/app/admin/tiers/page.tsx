import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listTiers } from "@/modules/iam/tiers";
import { TierRow } from "./TierRow";
import { CreateTierForm } from "./CreateTierForm";

export default async function TiersPage() {
  const user = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  const tiers = await listTiers();

  return (
    <AdminShell
      user={user}
      title="Membership Tiers"
      description="Manage membership tiers, ordering priority, and discounts."
    >
      <div className="mb-8 max-w-2xl">
        <CreateTierForm />
      </div>

      <div className="overflow-x-auto lunia-card">
        <table className="w-full text-left text-sm" data-testid="tiers-table">
          <thead className="bg-[var(--color-cream)]/60">
            <tr>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Key</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Name</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Priority</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Discount %</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">System</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Save</th>
              <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Delete</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => (
              <TierRow key={tier.id} tier={tier} />
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
