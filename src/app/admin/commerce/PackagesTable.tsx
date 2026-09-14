// Purely presentational -- no mutation controls here (packages are
// deactivated by editing isActive via a future edit action; out of scope
// for the initial commerce launch). Server component: no client-side state.

export interface PackageRowDTO {
  id: string;
  nameEn: string;
  nameAr: string;
  serviceName: string | null;
  sessionsTotal: number;
  priceMinor: number;
  isActive: boolean;
}

function formatMinor(minor: number): string {
  return `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
}

export function PackagesTable({ packages }: { packages: PackageRowDTO[] }) {
  if (packages.length === 0) {
    return <p className="text-sm text-[var(--color-ink)]/60">No packages created yet.</p>;
  }

  return (
    <div className="overflow-x-auto lunia-card">
      <table className="w-full text-left text-sm" data-testid="packages-table">
        <thead className="bg-[var(--color-cream)]/60">
          <tr>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Name</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Service</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Sessions</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Price</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Active</th>
          </tr>
        </thead>
        <tbody>
          {packages.map((pkg) => (
            <tr key={pkg.id} className="border-t border-[var(--color-ink)]/10" data-testid="package-row">
              <td className="px-4 py-2 text-[var(--color-ink)]">
                {pkg.nameEn} <span className="text-[var(--color-ink)]/50" dir="rtl">({pkg.nameAr})</span>
              </td>
              <td className="px-4 py-2 text-[var(--color-ink)]/70">{pkg.serviceName ?? "Any service"}</td>
              <td className="px-4 py-2 text-[var(--color-ink)]">{pkg.sessionsTotal}</td>
              <td className="whitespace-nowrap px-4 py-2 text-[var(--color-ink)]">{formatMinor(pkg.priceMinor)}</td>
              <td className="px-4 py-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    pkg.isActive ? "bg-[var(--color-teal)]/15 text-[var(--color-teal)]" : "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/60"
                  }`}
                >
                  {pkg.isActive ? "Active" : "Inactive"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
