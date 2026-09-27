import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listInvoices } from "@/modules/billing/invoices";
import { formatSarMinor } from "@/modules/billing/money";
import { StatusBadge, formatDateTime } from "./ui";

interface BillingPageProps {
  searchParams: Promise<{ status?: string; from?: string; to?: string; q?: string; kind?: string }>;
}

const STATUSES = ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "VOID"] as const;
type Status = (typeof STATUSES)[number];
const STATUS_LABEL: Record<Status, string> = { DRAFT: "Drafts", ISSUED: "Unpaid", PARTIALLY_PAID: "Part paid", PAID: "Paid", VOID: "Void" };

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
// Date filters are center-local (Asia/Riyadh, UTC+3) calendar days.
const dayStart = (iso: string) => new Date(`${iso}T00:00:00+03:00`);

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const user = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  const params = await searchParams;
  const status = (STATUSES as readonly string[]).includes(params.status ?? "") ? (params.status as Status) : undefined;
  const kind = params.kind === "CREDIT_NOTE" || params.kind === "INVOICE" ? params.kind : undefined;
  const from = isDate(params.from) ? params.from : undefined;
  const to = isDate(params.to) ? params.to : undefined;
  const q = params.q?.trim().slice(0, 80) || undefined;

  const { rows, totals } = await listInvoices({
    status,
    kind,
    q,
    from: from ? dayStart(from) : undefined,
    to: to ? new Date(dayStart(to).getTime() + 86_400_000) : undefined,
  });

  const qs = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { status, kind, from, to, q, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return s ? `/admin/billing?${s}` : "/admin/billing";
  };

  return (
    <AdminShell
      user={user}
      title="Invoices & payments"
      description="VAT tax invoices, payments, credit notes and pay links for the front desk."
      actions={
        <>
          <Link href="/admin/billing/settings" className="lunia-btn lunia-btn-ghost">
            Tax settings
          </Link>
          <Link href="/admin/billing/new" className="lunia-btn lunia-btn-forest">
            New invoice
          </Link>
        </>
      }
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {([undefined, ...STATUSES] as (Status | undefined)[]).map((s) => {
          const active = s === status && !kind;
          return (
            <Link
              key={s ?? "all"}
              href={qs({ status: s, kind: undefined })}
              className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-xs font-medium uppercase tracking-wide transition-colors ${
                active ? "bg-[var(--color-teal)] text-[var(--color-ink)]" : "border border-[var(--color-ink)]/20 text-[var(--color-ink)]/70 hover:bg-[var(--color-ink)]/5"
              }`}
            >
              {s ? STATUS_LABEL[s] : "All"}
            </Link>
          );
        })}
        <Link
          href={qs({ kind: kind === "CREDIT_NOTE" ? undefined : "CREDIT_NOTE", status: undefined })}
          className={`inline-flex min-h-[44px] items-center rounded-full px-4 text-xs font-medium uppercase tracking-wide transition-colors ${
            kind === "CREDIT_NOTE" ? "bg-[var(--color-teal)] text-[var(--color-ink)]" : "border border-[var(--color-ink)]/20 text-[var(--color-ink)]/70 hover:bg-[var(--color-ink)]/5"
          }`}
        >
          Credit notes
        </Link>
      </div>

      <form method="get" action="/admin/billing" className="mb-6 grid gap-3 lunia-card p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        {status && <input type="hidden" name="status" value={status} />}
        {kind && <input type="hidden" name="kind" value={kind} />}
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">
          Search
          <input name="q" defaultValue={q} placeholder="Invoice no., customer name or phone" className="lunia-input min-h-[44px] normal-case tracking-normal" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">
          From
          <input type="date" name="from" defaultValue={from} className="lunia-input min-h-[44px]" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">
          To
          <input type="date" name="to" defaultValue={to} className="lunia-input min-h-[44px]" />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="lunia-btn lunia-btn-forest min-h-[44px]">
            Filter
          </button>
          {(q || from || to) && (
            <Link href={qs({ q: undefined, from: undefined, to: undefined })} className="lunia-btn lunia-btn-ghost min-h-[44px]">
              Clear
            </Link>
          )}
        </div>
      </form>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Total label="Invoiced (net of credits)" value={formatSarMinor(totals.totalMinor)} />
        <Total label="VAT" value={formatSarMinor(totals.vatMinor)} />
        <Total label="Collected" value={formatSarMinor(totals.paidMinor)} />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-10 text-center text-sm text-[var(--color-ink)]/55">
          No invoices match these filters.
        </p>
      ) : (
        <>
          {/* Cards on phones / portrait iPad */}
          <ul className="flex flex-col gap-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/admin/billing/${r.id}`} className="lunia-card flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.status === "DRAFT" ? "Draft" : r.number}</p>
                    <p className="truncate text-sm text-[var(--color-ink)]/60">{r.customerName}</p>
                    <p className="text-xs text-[var(--color-ink)]/45">{formatDateTime(r.issuedAt ?? r.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-medium tabular-nums">
                      {r.kind === "CREDIT_NOTE" ? "−" : ""}
                      {formatSarMinor(r.totalMinor)}
                    </span>
                    <StatusBadge status={r.status} kind={r.kind} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto lunia-card md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
                <tr>
                  <th className="px-4 py-3 font-medium">Number</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">VAT</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface-2)]/60">
                    <td className="px-4 py-3">
                      <Link href={`/admin/billing/${r.id}`} className="font-medium text-[var(--color-teal-ink)] hover:underline">
                        {r.status === "DRAFT" ? "Draft" : r.number}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div>{r.customerName}</div>
                      {r.customerPhone && <div className="text-xs text-[var(--color-ink)]/50">{r.customerPhone}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--color-ink)]/70">{formatDateTime(r.issuedAt ?? r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} kind={r.kind} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatSarMinor(r.vatMinor)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {r.kind === "CREDIT_NOTE" ? "−" : ""}
                      {formatSarMinor(r.totalMinor)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--color-ink)]/70">
                      {r.kind === "INVOICE" ? formatSarMinor(r.paidMinor) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-[var(--line-strong)] bg-[var(--surface-2)]/60 font-medium">
                <tr>
                  <td className="px-4 py-3" colSpan={4}>
                    Totals (issued, credit notes subtracted)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatSarMinor(totals.vatMinor)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatSarMinor(totals.totalMinor)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatSarMinor(totals.paidMinor)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </AdminShell>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="lunia-card px-4 py-3">
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/50">{label}</p>
      <p className="mt-1 text-lg font-medium tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}
