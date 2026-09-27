import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getPurchaseOrder } from "@/modules/inventory/purchaseOrders";
import { getSetting } from "@/modules/cms/settings";
import { formatSarMinor } from "@/modules/inventory/money";
import { PrintButton } from "../../../_components/PrintButton";
import { formatDate } from "../../../_components/ui";

interface Props {
  params: Promise<{ id: string }>;
}

const VAT_BP = 1500;

// A clean, standalone purchase order document to print or save as PDF and
// send to the supplier. Deliberately outside AdminShell (no nav/chrome).
export default async function PurchaseOrderPrintPage({ params }: Props) {
  await requireAdmin(PERMISSIONS.INVENTORY_MANAGE);
  const { id } = await params;
  const po = await getPurchaseOrder(id);
  if (!po) notFound();
  const business = await getSetting("business").catch(() => null);

  const vatMinor = Math.round((po.totalMinor * VAT_BP) / 10_000);
  const s = po.supplier;

  return (
    <div className="min-h-screen bg-[var(--surface-2)] py-8 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between gap-3 px-4 print:hidden">
        <Link href={`/admin/inventory/purchase-orders/${po.id}`} className="lunia-btn lunia-btn-ghost min-h-11">
          Back
        </Link>
        <PrintButton />
      </div>

      <article className="mx-auto max-w-3xl bg-white px-8 py-10 text-[var(--color-ink)] shadow-[var(--shadow-md)] print:max-w-none print:px-0 print:py-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-[var(--line-strong)] pb-6">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG wordmark, no optimization needed for print */}
            <img src="/brand/wordmark.svg" alt={business?.nameEn || "Lunia"} className="h-9 w-auto" />
            <div className="mt-3 text-sm leading-relaxed text-[var(--color-ink)]/75">
              {business?.nameEn && <div className="font-medium text-[var(--color-ink)]">{business.nameEn}</div>}
              {business?.addressEn && <div>{business.addressEn}</div>}
              {business?.phone && <div>{business.phone}</div>}
              {business?.email && <div>{business.email}</div>}
            </div>
          </div>
          <div className="text-right">
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-medium">Purchase order</h1>
            <dl className="mt-3 grid grid-cols-[auto_auto] justify-end gap-x-4 gap-y-1 text-sm">
              <dt className="text-[var(--color-ink)]/60">Number</dt>
              <dd className="font-mono font-medium">{po.number}</dd>
              <dt className="text-[var(--color-ink)]/60">Date</dt>
              <dd>{formatDate(po.orderedAt ?? po.createdAt)}</dd>
              {po.status === "DRAFT" && (
                <>
                  <dt className="text-[var(--color-ink)]/60">Status</dt>
                  <dd className="font-medium">Draft</dd>
                </>
              )}
            </dl>
          </div>
        </header>

        <section className="mt-6 text-sm">
          <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink)]/55">Supplier</h2>
          <div className="mt-1.5 leading-relaxed">
            <div className="font-medium">{s.name}</div>
            {s.contactName && <div>Attn: {s.contactName}</div>}
            {s.phone && <div>{s.phone}</div>}
            {s.email && <div>{s.email}</div>}
            {s.vatNumber && <div>VAT no. {s.vatNumber}</div>}
          </div>
        </section>

        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line-strong)] text-left text-[0.65rem] uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
              <th className="py-2 pe-3">#</th>
              <th className="py-2 pe-3">Item</th>
              <th className="py-2 pe-3">SKU / barcode</th>
              <th className="py-2 pe-3 text-right">Qty</th>
              <th className="py-2 pe-3 text-right">Unit cost</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((l, i) => (
              <tr key={l.id} className="border-b border-[var(--line)] align-top">
                <td className="py-2 pe-3 text-[var(--color-ink)]/60">{i + 1}</td>
                <td className="py-2 pe-3">
                  {l.product.nameEn}
                  {l.product.brandName && <span className="block text-xs text-[var(--color-ink)]/60">{l.product.brandName}</span>}
                </td>
                <td className="py-2 pe-3 font-mono text-xs">{[l.product.sku, l.product.barcode].filter(Boolean).join(" / ") || "—"}</td>
                <td className="py-2 pe-3 text-right tabular-nums">
                  {l.qty} {l.product.unit}
                </td>
                <td className="py-2 pe-3 text-right tabular-nums">{formatSarMinor(l.unitCostMinor)}</td>
                <td className="py-2 text-right tabular-nums">{formatSarMinor(l.qty * l.unitCostMinor)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-sm">
            <tr>
              <td colSpan={5} className="pt-4 pe-3 text-right text-[var(--color-ink)]/60">
                Subtotal (excl. VAT)
              </td>
              <td className="pt-4 text-right tabular-nums">{formatSarMinor(po.totalMinor)}</td>
            </tr>
            <tr>
              <td colSpan={5} className="py-1 pe-3 text-right text-[var(--color-ink)]/60">
                VAT 15%
              </td>
              <td className="py-1 text-right tabular-nums">{formatSarMinor(vatMinor)}</td>
            </tr>
            <tr className="font-semibold">
              <td colSpan={5} className="border-t border-[var(--line-strong)] pt-2 pe-3 text-right">
                Total (incl. VAT)
              </td>
              <td className="border-t border-[var(--line-strong)] pt-2 text-right tabular-nums">{formatSarMinor(po.totalMinor + vatMinor)}</td>
            </tr>
          </tfoot>
        </table>

        {po.notes && (
          <section className="mt-8 text-sm">
            <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink)]/55">Notes</h2>
            <p className="mt-1.5 whitespace-pre-line">{po.notes}</p>
          </section>
        )}

        <p className="mt-10 text-xs text-[var(--color-ink)]/55">
          Please quote {po.number} on your delivery note and tax invoice. Amounts in Saudi riyals; VAT shown is an estimate at the standard rate.
        </p>
      </article>
    </div>
  );
}
