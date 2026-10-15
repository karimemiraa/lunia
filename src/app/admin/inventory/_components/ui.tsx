import type { ReactNode } from "react";
import Link from "next/link";
import { Tr } from "../../_i18n/StaffI18n";
import { intlLocale, type StaffLocale, type T } from "../../_i18n/t";
import { EnumText } from "./i18n";

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
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] px-4 py-8 text-center text-sm text-[var(--color-ink)]/60">
        {empty ?? <Tr>Nothing here yet.</Tr>}
      </p>
    );
  }
  const [first, ...rest] = columns;
  return (
    <>
      <div className="hidden overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-md)] lg:block">
        <table className="w-full text-start text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)]">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-ink)]/55 ${c.align === "right" ? "text-end" : ""}`}
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
                  <td key={c.key} className={`px-4 py-3 text-[var(--color-ink)]/90 ${c.align === "right" ? "text-end tabular-nums" : ""}`}>
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

/** English labels for purchase-order statuses (translated in Arabic mode). */
export const PO_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  ORDERED: "Ordered",
  PARTIAL: "Partial",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

export function PoStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={PO_TONES[status] ?? "neutral"}>
      <EnumText value={status} label={PO_STATUS_LABELS[status]} />
    </Badge>
  );
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
  const label = MOVEMENT_LABELS[type];
  // "Used" is ambiguous in the shared dictionary, so Arabic looks up a context key.
  return <Badge tone={tone}>{label ? <EnumText value={label} label={label === "Used" ? "Used (consumed)" : label} /> : type}</Badge>;
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

export { InventorySubnav } from "./i18n";

export function formatDate(d: Date | string | null | undefined, locale: StaffLocale = "en"): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(new Date(d));
}

export function formatDateTime(d: Date | string, locale: StaffLocale = "en"): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(d));
}

/** A product's display name: the Arabic name in Arabic mode when there is one. */
export function productName(p: { nameEn: string; nameAr?: string | null }, locale: StaffLocale): string {
  return locale === "ar" && p.nameAr ? p.nameAr : p.nameEn;
}

/** "12 pcs" with the unit label translated ("pcs", "ml", "g" are UI labels). */
export function qtyUnit(qty: number | string, unit: string, t: T): string {
  return `${qty} ${t(unit)}`;
}

const SLOT = "\u0000";

/**
 * A translated sentence with one element placed inside it:
 * withSlot(t, "No product with code {code}.", "code", <b>…</b>). Keeps the
 * sentence whole for translators instead of gluing fragments together.
 */
export function withSlot(t: T, text: string, name: string, node: ReactNode, vars?: Record<string, string | number>): ReactNode {
  const [before, ...rest] = t(text, { ...vars, [name]: SLOT }).split(SLOT);
  return (
    <>
      {before}
      {node}
      {rest.join("")}
    </>
  );
}

/** English labels for product kinds (translated with t()). */
export const KIND_LABELS: Record<string, string> = { RETAIL: "Retail", CONSUMABLE: "Consumable", BOTH: "Both" };

export const labelClass = "flex flex-col gap-1.5 text-sm";
export const labelText = "text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60";
