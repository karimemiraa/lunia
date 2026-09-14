// Purely presentational ledger of package purchases across all clients.

export interface PackagePurchaseRowDTO {
  id: string;
  clientName: string;
  packageNameEn: string;
  sessionsRemaining: number;
  sessionsTotal: number;
  status: "ACTIVE" | "EXHAUSTED" | "EXPIRED";
  createdAtIso: string;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));
}

const STATUS_STYLES: Record<PackagePurchaseRowDTO["status"], string> = {
  ACTIVE: "bg-[var(--color-teal)]/15 text-[var(--color-teal)]",
  EXHAUSTED: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/60",
  EXPIRED: "bg-red-100 text-red-700",
};

export function PackagePurchasesTable({ purchases }: { purchases: PackagePurchaseRowDTO[] }) {
  if (purchases.length === 0) {
    return <p className="text-sm text-[var(--color-ink)]/60">No package purchases recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto lunia-card">
      <table className="w-full text-left text-sm" data-testid="package-purchases-table">
        <thead className="bg-[var(--color-cream)]/60">
          <tr>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Client</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Package</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Sessions left</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Status</th>
            <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Purchased</th>
          </tr>
        </thead>
        <tbody>
          {purchases.map((purchase) => (
            <tr key={purchase.id} className="border-t border-[var(--color-ink)]/10" data-testid="package-purchase-row">
              <td className="px-4 py-2 text-[var(--color-ink)]">{purchase.clientName}</td>
              <td className="px-4 py-2 text-[var(--color-ink)]/70">{purchase.packageNameEn}</td>
              <td className="px-4 py-2 text-[var(--color-ink)]">
                {purchase.sessionsRemaining} / {purchase.sessionsTotal}
              </td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[purchase.status]}`}>
                  {purchase.status}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-[var(--color-ink)]/70">{formatDate(purchase.createdAtIso)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
