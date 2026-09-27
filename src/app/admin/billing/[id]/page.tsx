import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { creditableLines, getInvoiceDetail } from "@/modules/billing/invoices";
import { getTaxSettings, taxSettingsIssues } from "@/modules/billing/settings";
import { invoiceBalance } from "@/modules/billing/settlement";
import { onlinePaymentsConfigured } from "@/modules/billing/payments/links";
import { invoicePublicUrl } from "@/modules/billing/token";
import { formatSarMinor, inclusiveEditorValues } from "@/modules/billing/money";
import { encodeQr, qrToSvg } from "@/modules/billing/zatca/qrcode";
import { prisma } from "@/lib/db";
import { InvoiceEditor, type EditorLine } from "../InvoiceEditor";
import { IssuedActions } from "./IssuedActions";
import { METHOD_LABELS, StatusBadge, formatDateTime } from "../ui";

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
    const products = await prisma.product.findMany({
      where: { id: { in: invoice.lines.map((l) => l.productId).filter((x): x is string => !!x) } },
      select: { id: true, stockQty: true },
    });
    for (const l of lines) if (l.productId) l.stockQty = products.find((p) => p.id === l.productId)?.stockQty;

    return (
      <AdminShell
        user={user}
        title="Draft invoice"
        description={invoice.bookingId ? "Checkout for a booking — review the lines, then issue." : "Review the lines, then issue."}
      >
        <InvoiceEditor
          invoiceId={invoice.id}
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

  return (
    <AdminShell
      user={user}
      title={isCredit ? `Credit note ${invoice.number}` : invoice.status === "VOID" ? "Voided draft" : `Invoice ${invoice.number}`}
      description={`${invoice.customerName} · ${formatDateTime(invoice.issuedAt ?? invoice.createdAt)}`}
      actions={
        invoice.status !== "VOID" ? (
          <>
            <Link href={`/admin/billing/${invoice.id}/print`} target="_blank" className="lunia-btn lunia-btn-ghost min-h-[44px]">
              Print A4
            </Link>
            <Link href={`/admin/billing/${invoice.id}/print?format=receipt`} target="_blank" className="lunia-btn lunia-btn-ghost min-h-[44px]">
              Receipt
            </Link>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Status" value={<StatusBadge status={invoice.status} kind={invoice.kind} />} />
          <Metric label={isCredit ? "Credited" : "Total"} value={formatSarMinor(invoice.totalMinor)} />
          <Metric label="VAT" value={formatSarMinor(invoice.vatMinor)} />
          {balance ? (
            <Metric
              label="Balance due"
              value={formatSarMinor(Math.max(0, balance.balanceMinor))}
              hint={balance.creditedMinor ? `${formatSarMinor(balance.creditedMinor)} credited` : undefined}
            />
          ) : (
            <Metric label={isCredit ? "Refunded" : "Paid"} value={formatSarMinor(invoice.paidMinor)} />
          )}
        </div>

        {!isCredit && invoice.status !== "VOID" && balance && (
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
          />
        )}

        <section className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <div className="lunia-card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[var(--line)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
                <tr>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 text-right font-medium">Qty</th>
                  <th className="px-4 py-3 text-right font-medium">Unit (excl.)</th>
                  <th className="px-4 py-3 text-right font-medium">VAT</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((l) => (
                  <tr key={l.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-4 py-3">
                      {l.description}
                      {l.discountMinor > 0 && <span className="block text-xs text-[var(--color-ink)]/50">Discount {formatSarMinor(l.discountMinor)}</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{l.qty}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatSarMinor(l.unitPriceMinor)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{l.vatRateBp / 100}%</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatSarMinor(l.totalMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="grid gap-1 border-t border-[var(--line)] px-4 py-3 text-sm sm:ms-auto sm:max-w-sm">
              <Line label="Subtotal (excl. VAT)" value={invoice.subtotalMinor} />
              {invoice.discountMinor > 0 && <Line label="Invoice discount" value={-invoice.discountMinor} />}
              <Line label="VAT" value={invoice.vatMinor} />
              <Line label="Total" value={invoice.totalMinor} strong />
            </dl>
          </div>

          <aside className="flex flex-col gap-4">
            <div className="lunia-card flex flex-col gap-2 p-4 text-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/55">Customer</h2>
              <p className="font-medium">{invoice.customerName}</p>
              {invoice.customerPhone && <p className="text-[var(--color-ink)]/65">{invoice.customerPhone}</p>}
              {invoice.customerVatNumber && <p className="text-[var(--color-ink)]/65">VAT {invoice.customerVatNumber}</p>}
              {invoice.clientProfileId && (
                <Link href={`/admin/clients/${invoice.clientProfileId}`} className="text-[var(--color-teal-ink)] underline">
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
            {qr && (
              <div className="lunia-card flex flex-col items-center gap-2 p-4 text-center text-xs text-[var(--color-ink)]/60">
                <div className="w-40" dangerouslySetInnerHTML={{ __html: qr }} />
                <p>ZATCA Phase 1 QR · ICV {invoice.zatcaCounter}</p>
                <p className="break-all">UUID {invoice.zatcaUuid}</p>
                <p>
                  Phase 2: {invoice.zatcaStatus === "NOT_SUBMITTED" ? "not submitted (Fatoora onboarding pending)" : invoice.zatcaStatus}
                </p>
                <a href={`/admin/billing/${invoice.id}/xml`} className="font-medium text-[var(--color-teal-ink)] underline">
                  Download UBL XML
                </a>
              </div>
            )}
          </aside>
        </section>

        {(invoice.payments.length > 0 || invoice.paymentLinks.length > 0) && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">{isCredit ? "Refunds" : "Payments"}</h2>
            <ul className="flex flex-col gap-2">
              {invoice.payments.map((p) => (
                <li key={p.id} className="lunia-card flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
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
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-3 text-sm">
                  <span>
                    Pay link ({l.provider}) · <span className="font-medium">{l.status.toLowerCase()}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-xs text-[var(--color-ink)]/50">{formatDateTime(l.createdAt)}</span>
                    <span className="tabular-nums">{formatSarMinor(l.amountMinor)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {creditNotes.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Credit notes</h2>
            <ul className="flex flex-col gap-2">
              {creditNotes.map((cn) => (
                <li key={cn.id}>
                  <Link href={`/admin/billing/${cn.id}`} className="lunia-card flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span>
                      <span className="font-medium">{cn.number}</span>
                      <span className="ms-2 text-[var(--color-ink)]/55">{cn.notes}</span>
                    </span>
                    <span className="tabular-nums">−{formatSarMinor(cn.totalMinor)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AdminShell>
  );
}

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="lunia-card px-4 py-3">
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/50">{label}</p>
      <div className="mt-1 text-lg font-medium tabular-nums">{value}</div>
      {hint && <p className="text-xs text-[var(--color-ink)]/45">{hint}</p>}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "border-t border-[var(--line)] pt-2 font-medium" : ""}`}>
      <dt className="text-[var(--color-ink)]/65">{label}</dt>
      <dd className="tabular-nums">{formatSarMinor(value)}</dd>
    </div>
  );
}
