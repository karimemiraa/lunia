import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listInvoices } from "@/modules/billing/invoices";
import { KpiCard } from "../_ui/Layout";
import { FilterBar, FilterChips } from "../_ui/FilterBar";
import { DateRangeFields, DateRangeShortcuts } from "../_ui/DateRangePicker";
import { formatSar } from "../_ui/money";
import { toISODate } from "../_ui/dates";
import { InvoicesTable, type InvoiceRowDTO } from "./InvoicesTable";

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
  const todayISO = toISODate();

  const { rows, totals } = await listInvoices({
    status,
    kind,
    q,
    from: from ? dayStart(from) : undefined,
    to: to ? new Date(dayStart(to).getTime() + 86_400_000) : undefined,
  });

  const dto: InvoiceRowDTO[] = rows.map((r) => ({
    id: r.id,
    number: r.number,
    kind: r.kind,
    status: r.status,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    dateIso: (r.issuedAt ?? r.createdAt).toISOString(),
    totalMinor: r.totalMinor,
    vatMinor: r.vatMinor,
    paidMinor: r.paidMinor,
  }));

  const current = { status, kind, from, to, q };
  const chipValues = [...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))];
  const unpaidCount = rows.filter((r) => r.kind === "INVOICE" && (r.status === "ISSUED" || r.status === "PARTIALLY_PAID")).length;

  return (
    <AdminShell
      user={user}
      title="Invoices & payments"
      description="VAT tax invoices, payments, credit notes and pay links for the front desk."
      actions={
        <>
          <Link href="/admin/billing/settings" className="lunia-btn lunia-btn-ghost min-h-11">
            Tax settings
          </Link>
          <Link href="/admin/billing/new" className="lunia-btn lunia-btn-forest min-h-11">
            New sale
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Invoiced (net of credits)" value={formatSar(totals.totalMinor)} hint="Incl. VAT, for this filter" />
          <KpiCard label="VAT" value={formatSar(totals.vatMinor)} />
          <KpiCard label="Collected" value={formatSar(totals.paidMinor)} tone="success" />
          <KpiCard label="Awaiting payment" value={unpaidCount} tone={unpaidCount > 0 ? "warning" : "neutral"} hint={unpaidCount > 0 ? "Open invoices in this list" : "Nothing outstanding"} href={unpaidCount > 0 ? "/admin/billing?status=ISSUED" : undefined} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterChips base="/admin/billing" param="status" values={chipValues} active={kind ? undefined : status} params={{ from, to, q }} label="Invoice status" />
          <Link
            href={kind === "CREDIT_NOTE" ? "/admin/billing" : "/admin/billing?kind=CREDIT_NOTE"}
            aria-current={kind === "CREDIT_NOTE" ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 text-xs font-medium uppercase tracking-wide transition-colors ${
              kind === "CREDIT_NOTE" ? "bg-[var(--color-teal)] text-[var(--color-ink)]" : "border border-[var(--color-ink)]/20 text-[var(--color-ink)]/70 hover:bg-[var(--color-ink)]/5"
            }`}
          >
            Credit notes
          </Link>
        </div>

        <FilterBar base="/admin/billing" params={current} keep={["status", "kind"]} searchParam="q" searchPlaceholder="Invoice no., customer name or phone" actions={<DateRangeShortcuts base="/admin/billing" todayISO={todayISO} params={current} activeFrom={from} activeTo={to} only={["Today", "Last 7 days", "This month", "Last month"]} />}>
          <DateRangeFields fromISO={from ?? ""} toISO={to ?? ""} />
        </FilterBar>

        <InvoicesTable rows={dto} totals={totals} filtered={!!(status || kind || from || to || q)} />
      </div>
    </AdminShell>
  );
}
