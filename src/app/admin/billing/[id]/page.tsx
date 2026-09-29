import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { creditableLines, getInvoiceDetail } from "@/modules/billing/invoices";
import { getTaxSettings, taxSettingsIssues } from "@/modules/billing/settings";
import { quickPicks } from "@/modules/billing/lookup";
import { invoiceBalance } from "@/modules/billing/settlement";
import { onlinePaymentsConfigured } from "@/modules/billing/payments/links";
import { invoicePublicUrl } from "@/modules/billing/token";
import { formatSarMinor, inclusiveEditorValues } from "@/modules/billing/money";
import { encodeQr, qrToSvg } from "@/modules/billing/zatca/qrcode";
import { prisma } from "@/lib/db";
import { InvoiceEditor, type EditorLine } from "../InvoiceEditor";
import { IssuedActions } from "./IssuedActions";
import { METHOD_LABELS, StatusBadge, formatDateTime } from "../ui";
import { KpiCard, SectionCard, DescriptionList } from "../../_ui/Layout";

interface InvoicePageProps {
  params: Promise<{ id: string }>;
}

export default async function InvoicePage({ params }: InvoicePageProps) {
  const { id } = await params;
  const user = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  const detail = await getInvoiceDetail(id);
  if (!detail) notFound();
  const { invoice, creditNotes, original } = detail;
  const settings = await getTaxSettings();

  if (invoice.status === "DRAFT") {
    const lines: EditorLine[] = invoice.lines.map((l) => {
      const incl = settings.pricesIncludeVat ? inclusiveEditorValues(l) : { unitInclMinor: l.unitPriceMinor, discountInclMinor: l.discountMinor };
      return {
        kind: l.kind as EditorLine["kind"],
        serviceId: l.serviceId,
        productId: l.productId,
        description: l.description,
        qty: l.qty,
        unitPriceMinor: incl.unitInclMinor,
        discountMinor: incl.discountInclMinor,
        vatRateBp: l.vatRateBp,
      };
    });
    const lineTotal = invoice.lines.reduce((s, l) => s + l.totalMinor, 0);
    const [products, picks] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: invoice.lines.map((l) => l.productId).filter((x): x is string => !!x) } },
        select: { id: true, stockQty: true },
      }),
      quickPicks(8),
    ]);
    for (const l of lines) if (l.productId) l.stockQty = products.find((p) => p.id === l.productId)?.stockQty;

    return (
      <AdminShell
        user={user}
        title="Draft invoice"
        description={invoice.bookingId ? "Checkout for a booking — review the lines, then issue." : "Review the lines, then issue."}
      >
        <InvoiceEditor
          invoiceId={invoice.id}
          quickPicks={picks}
          pricesIncludeVat={settings.pricesIncludeVat}
          defaultVatRateBp={settings.defaultVatRateBp}
          settingsIssues={taxSettingsIssues(settings)}
          initial={{
            clientProfileId: invoice.clientProfileId,
            bookingId: invoice.bookingId,
            customerName: invoice.customerName,
            customerPhone: invoice.customerPhone ?? "",
            customerVatNumber: invoice.customerVatNumber ?? "",
            notes: invoice.notes ?? "",
            lines,
            invoiceDiscountMinor: settings.pricesIncludeVat ? lineTotal - invoice.totalMinor : invoice.discountMinor,
          }}
        />
      </AdminShell>
    );
  }

  const isCredit = invoice.kind === "CREDIT_NOTE";
  const [balance, payConfigured, creditable] = await Promise.all([
    !isCredit && invoice.status !== "VOID" ? invoiceBalance(prisma, invoice) : null,
    onlinePaymentsConfigured(),
    !isCredit && invoice.status !== "VOID" ? creditableLines(invoice.id) : Promise.resolve([]),
  ]);
  const publicUrl = invoice.status !== "VOID" ? invoicePublicUrl(invoice.id, invoice.client?.user.locale === "en" ? "en" : "ar") : null;
  const pendingLink = invoice.paymentLinks.find((l) => l.status === "PENDING");
  const qr = invoice.zatcaQr ? qrToSvg(encodeQr(invoice.zatcaQr), { title: "ZATCA QR" }) : null;
  const showPanel = !isCredit && invoice.status !== "VOID" && !!balance;

  return (
    <AdminShell
      user={user}
      title={isCredit ? `Credit note ${invoice.number}` : invoice.status === "VOID" ? "Voided draft" : `Invoice ${invoice.number}`}
      description={`${invoice.customerName} · ${formatDateTime(invoice.issuedAt ?? invoice.createdAt)}`}
      actions={
        invoice.status !== "VOID" && !showPanel ? (
          <>
            <Link href={`/admin/billing/${invoice.id}/print`} target="_blank" className="lunia-btn lunia-btn-ghost min-h-11">
              Print A4
            </Link>
            <Link href={`/admin/billing/${invoice.id}/print?format=receipt`} target="_blank" className="lunia-btn lunia-btn-forest-outline min-h-11">
              Receipt
            </Link>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Status" value={<StatusBadge status={invoice.status} kind={invoice.kind} />} />
          <KpiCard label={isCredit ? "Credited" : "Total incl. VAT"} value={formatSarMinor(invoice.totalMinor)} />
          <KpiCard label="VAT" value={formatSarMinor(invoice.vatMinor)} />
          {balance ? (
            <KpiCard
              label="Balance due"
              tone={balance.balanceMinor > 0 ? "warning" : "success"}
              value={formatSarMinor(Math.max(0, balance.balanceMinor))}
              hint={balance.creditedMinor ? `${formatSarMinor(balance.creditedMinor)} credited` : undefined}
            />
          ) : (
            <KpiCard label={isCredit ? "Refunded" : "Paid"} value={formatSarMinor(invoice.paidMinor)} />
          )}
        </div>

        <div className={`grid gap-5 lg:items-start ${showPanel ? "lg:grid-cols-[minmax(0,1fr)_24rem]" : "lg:grid-cols-[minmax(0,1fr)_18rem]"}`}>
          <div className="flex flex-col gap-6">
            <section className="lunia-card overflow-x-auto" aria-label="Invoice lines">
              <table className="w-full text-start text-sm">
                <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/60">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-start font-semibold">Item</th>
                    <th scope="col" className="px-4 py-3 text-end font-semibold">Qty</th>
                    <th scope="col" className="px-4 py-3 text-end font-semibold">Unit (excl. VAT)</th>
                    <th scope="col" className="px-4 py-3 text-end font-semibold">VAT</th>
                    <th scope="col" className="px-4 py-3 text-end font-semibold">Total incl. VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((l) => (
                    <tr key={l.id} className="border-b border-[var(--line)] last:border-0">
                      <td className="px-4 py-3">
                        {l.description}
                        {l.discountMinor > 0 && <span className="block text-xs text-[var(--color-ink)]/50">Discount {formatSarMinor(l.discountMinor)}</span>}
                      </td>
                      <td className="px-4 py-3 text-end tabular-nums">{l.qty}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{formatSarMinor(l.unitPriceMinor)}</td>
                      <td className="px-4 py-3 text-end tabular-nums">{l.vatRateBp / 100}%</td>
                      <td className="px-4 py-3 text-end tabular-nums">{formatSarMinor(l.totalMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-[var(--line)] px-4 py-3 sm:ms-auto sm:max-w-sm">
                <DescriptionList
                  items={[
                    { label: "Subtotal (excl. VAT)", value: formatSarMinor(invoice.subtotalMinor), numeric: true },
                    ...(invoice.discountMinor > 0 ? [{ label: "Invoice discount", value: `-${formatSarMinor(invoice.discountMinor)}`, numeric: true }] : []),
                    { label: "VAT", value: formatSarMinor(invoice.vatMinor), numeric: true },
                    { label: <span className="font-medium text-[var(--color-ink)]">Total incl. VAT</span>, value: <span className="text-lg font-medium">{formatSarMinor(invoice.totalMinor)}</span>, numeric: true },
                  ]}
                />
              </div>
            </section>

            {(invoice.payments.length > 0 || invoice.paymentLinks.length > 0) && (
              <SectionCard title={isCredit ? "Refunds" : "Payments"} padded={false}>
                <ul className="flex flex-col divide-y divide-[var(--line)]">
                  {invoice.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                      <span>
                        <span className="font-medium">{METHOD_LABELS[p.method] ?? p.method}</span>
                        {p.reference && <span className="ms-2 text-[var(--color-ink)]/55">{p.reference}</span>}
                        {p.cashSessionId && <span className="ms-2 text-xs text-[var(--color-ink)]/45">cash drawer</span>}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-[var(--color-ink)]/50">{formatDateTime(p.receivedAt)}</span>
                        <span className="font-medium tabular-nums">{formatSarMinor(p.amountMinor)}</span>
                      </span>
                    </li>
                  ))}
                  {invoice.paymentLinks.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm text-[var(--color-ink)]/70">
                      <span>
                        Pay link ({l.provider}) · <StatusBadge status={l.status} />
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-[var(--color-ink)]/50">{formatDateTime(l.createdAt)}</span>
                        <span className="tabular-nums">{formatSarMinor(l.amountMinor)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}

            {creditNotes.length > 0 && (
              <SectionCard title="Credit notes" padded={false}>
                <ul className="flex flex-col divide-y divide-[var(--line)]">
                  {creditNotes.map((cn) => (
                    <li key={cn.id}>
                      <Link href={`/admin/billing/${cn.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-[var(--surface-2)]/60">
                        <span>
                          <span className="font-medium">{cn.number}</span>
                          <span className="ms-2 text-[var(--color-ink)]/55">{cn.notes}</span>
                        </span>
                        <span className="tabular-nums">−{formatSarMinor(cn.totalMinor)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
            {showPanel && balance && (
              <IssuedActions
                invoiceId={invoice.id}
                balanceMinor={Math.max(0, balance.balanceMinor)}
                refundableMinor={balance.paidMinor - balance.refundedMinor}
                clientProfileId={invoice.clientProfileId}
                hasPhone={!!(invoice.customerPhone || invoice.client?.user.phone)}
                hasEmail={!!invoice.client?.user.email}
                payConfigured={payConfigured}
                pendingLinkUrl={pendingLink?.url ?? null}
                publicUrl={publicUrl}
                creditable={creditable.map((l) => ({
                  sortOrder: l.sortOrder,
                  description: l.description,
                  qty: l.qty,
                  remainingQty: l.remainingQty,
                  totalMinor: l.totalMinor,
                  isProduct: l.kind === "PRODUCT",
                }))}
                lineSumMinor={invoice.lines.reduce((s, l) => s + l.totalMinor, 0)}
                totalMinor={invoice.totalMinor}
                payments={invoice.payments.map((p) => ({ method: p.method, amountMinor: p.amountMinor }))}
              />
            )}
            <SectionCard title="Customer">
              <div className="flex flex-col gap-1 text-sm">
                <p className="font-medium">{invoice.customerName}</p>
                {invoice.customerPhone && <p className="text-[var(--color-ink)]/65">{invoice.customerPhone}</p>}
                {invoice.customerVatNumber && <p className="text-[var(--color-ink)]/65">VAT {invoice.customerVatNumber}</p>}
                {invoice.clientProfileId && (
                  <Link href={`/admin/clients/${invoice.clientProfileId}`} className="mt-1 inline-flex min-h-11 items-center text-[var(--color-teal-ink)] underline-offset-4 hover:underline">
                    Open customer profile
                  </Link>
                )}
                {original && (
                  <p className="text-[var(--color-ink)]/65">
                    Credits invoice{" "}
                    <Link href={`/admin/billing/${original.id}`} className="text-[var(--color-teal-ink)] underline">
                      {original.number}
                    </Link>
                  </p>
                )}
                {isCredit && invoice.notes && <p className="text-[var(--color-ink)]/65">Reason: {invoice.notes}</p>}
              </div>
            </SectionCard>
            {qr && (
              <div className="lunia-card flex flex-col items-center gap-2 p-4 text-center text-xs text-[var(--color-ink)]/60">
                <div className="w-32" dangerouslySetInnerHTML={{ __html: qr }} />
                <p>ZATCA Phase 1 QR · ICV {invoice.zatcaCounter}</p>
                <p className="break-all">UUID {invoice.zatcaUuid}</p>
                <p>Phase 2: {invoice.zatcaStatus === "NOT_SUBMITTED" ? "not submitted (Fatoora onboarding pending)" : invoice.zatcaStatus}</p>
                <a href={`/admin/billing/${invoice.id}/xml`} className="inline-flex min-h-11 items-center font-medium text-[var(--color-teal-ink)] underline">
                  Download UBL XML
                </a>
              </div>
            )}
          </aside>
        </div>
      </div>
    </AdminShell>
  );
}
