import type { ReactNode } from "react";
import Link from "next/link";

// Shared presentational bits for the inventory admin. No hooks, so these work
// from both server and client components.

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "right";
  /** Hide in the stacked mobile card (e.g. the primary column is the card title). */
  hideOnCard?: boolean;
}

/**
 * A table on wide screens, stacked label/value cards on phones and portrait
 * iPads. The first column becomes the card's heading.
 */
export function ResponsiveTable<T>({
  columns,
  rows,
  rowKey,
  empty = "Nothing here yet.",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] px-4 py-8 text-center text-sm text-[var(--color-ink)]/60">
        {empty}
      </p>
    );
  }
  const [first, ...rest] = columns;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-md)] lg:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-ink)]/55 ${c.align === "right" ? "text-right" : ""}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-[var(--line)] align-top transition-colors hover:bg-[var(--color-teal)]/[0.06]">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 text-[var(--color-ink)]/90 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-3 lg:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="lunia-card p-4">
            <div className="mb-2 text-sm font-medium text-[var(--color-ink)]">{first.render(row)}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              {rest
                .filter((c) => !c.hideOnCard)
                .map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]/50">{c.header}</dt>
                    <dd className="mt-0.5 break-words text-[var(--color-ink)]/90">{c.render(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

const TONES = {
  neutral: "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/70",
  teal: "bg-[var(--color-teal)]/25 text-[var(--color-ink)]",
  gold: "bg-[var(--color-gold)]/30 text-[var(--color-ink)]",
  green: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
  red: "bg-red-100 text-red-800",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide ${TONES[tone]}`}>
      {children}
    </span>
  );
}

const PO_TONES: Record<string, keyof typeof TONES> = {
  DRAFT: "neutral",
  ORDERED: "teal",
  PARTIAL: "gold",
  RECEIVED: "green",
  CANCELLED: "red",
};

export function PoStatusBadge({ status }: { status: string }) {
  return <Badge tone={PO_TONES[status] ?? "neutral"}>{status}</Badge>;
}

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: "Received",
  SALE: "Sold",
  CONSUMPTION: "Used",
  ADJUSTMENT: "Adjustment",
  RETURN: "Returned",
  WASTE: "Waste",
};

export function MovementBadge({ type }: { type: string }) {
  const tone: keyof typeof TONES = type === "PURCHASE" ? "green" : type === "WASTE" || type === "RETURN" ? "red" : type === "ADJUSTMENT" ? "gold" : "teal";
  return <Badge tone={tone}>{MOVEMENT_LABELS[type] ?? type}</Badge>;
}

export function StatCard({ label, value, hint, href, tone }: { label: string; value: ReactNode; hint?: string; href?: string; tone?: "alert" }) {
  const body = (
    <div className={`lunia-card h-full p-5 ${href ? "transition-shadow hover:shadow-[var(--shadow-glow)]" : ""}`}>
      <div className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink)]/55">{label}</div>
      <div className={`mt-2 font-[family-name:var(--font-display)] text-3xl ${tone === "alert" ? "text-red-700" : "text-[var(--color-ink)]"}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--color-ink)]/55">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Section({ title, actions, children, id }: { title: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-10 scroll-mt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-medium text-[var(--color-ink)]">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

const SUBNAV = [
  { href: "/admin/inventory", label: "Products & stock" },
  { href: "/admin/inventory/stock-take", label: "Stock-take" },
  { href: "/admin/inventory/purchase-orders", label: "Purchase orders" },
  { href: "/admin/inventory/suppliers", label: "Suppliers" },
];

export function InventorySubnav({ active }: { active: string }) {
  return (
    <nav aria-label="Inventory" className="mb-6 flex gap-1 overflow-x-auto border-b border-[var(--line)]">
      {SUBNAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === active ? "page" : undefined}
          className={`-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 px-4 text-sm transition-colors ${
            item.href === active
              ? "border-[var(--color-teal-ink)] font-medium text-[var(--color-ink)]"
              : "border-transparent text-[var(--color-ink)]/60 hover:text-[var(--color-ink)]"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(d));
}

export function formatDateTime(d: Date | string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(d));
}

export const labelClass = "flex flex-col gap-1.5 text-sm";
export const labelText = "text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60";
