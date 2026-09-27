// The printable bilingual tax invoice / credit note (Arabic + English side by
// side, as Saudi tax invoices usually are). One component serves the staff
// print page and the customer's tokenized view, in two formats: A4 and an
// 80 mm thermal receipt. Pure server-rendered markup + print CSS; amounts use
// Latin digits so they stay unambiguous in both languages.

import type { ReactNode } from "react";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import { formatAmount } from "@/modules/billing/money";
import type { InvoiceDocument } from "@/modules/billing/document";

type DocKey = keyof typeof en.invoices.doc;
export type InvoiceFormat = "a4" | "receipt";

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? "");

function riyadh(d: Date | null): string {
  if (!d) return "—";
  const local = new Date(d.getTime() + 3 * 3_600_000).toISOString();
  return `${local.slice(0, 10)} ${local.slice(11, 16)}`;
}

/** "English | العربية" label pair. */
function L({ k, vars = {}, stacked = false }: { k: DocKey; vars?: Record<string, string>; stacked?: boolean }) {
  return (
    <span className={stacked ? "flex flex-col" : "inline-flex flex-wrap items-baseline gap-x-1.5"}>
      <span>{fill(en.invoices.doc[k], vars)}</span>
      <span dir="rtl" lang="ar" className="font-[family-name:var(--font-body-ar)]">
        {fill(ar.invoices.doc[k], vars)}
      </span>
    </span>
  );
}

const PRINT_CSS = {
  a4: `@page { size: A4; margin: 12mm; }`,
  receipt: `@page { size: 80mm auto; margin: 3mm; }`,
};

export function InvoiceDocumentView({ doc, format, toolbar }: { doc: InvoiceDocument; format: InvoiceFormat; toolbar?: ReactNode }) {
  const s = doc.seller;
  const isCredit = doc.kind === "CREDIT_NOTE";
  const isDraft = doc.status === "DRAFT";
  const addressEn = [s.buildingNo, s.street, s.district, s.city, s.postalCode].filter(Boolean).join(", ");

  const css = `
    ${PRINT_CSS[format]}
    @media print {
      html, body { background: #fff !important; }
      .invoice-no-print { display: none !important; }
      .invoice-sheet { box-shadow: none !important; border: 0 !important; margin: 0 !important; width: auto !important; max-width: none !important; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  `;

  const title = isCredit ? (
    <>
      <span>{en.invoices.doc.creditNote}</span>
      <span dir="rtl" lang="ar">
        {ar.invoices.doc.creditNote}
      </span>
    </>
  ) : (
    <>
      <span>{en.invoices.doc.simplifiedTaxInvoice}</span>
      <span dir="rtl" lang="ar">
        {ar.invoices.doc.simplifiedTaxInvoice}
      </span>
    </>
  );

  const totals: { k: DocKey; v: number; strong?: boolean }[] = [
    { k: "subtotal", v: doc.subtotalMinor },
    ...(doc.discountMinor > 0 ? [{ k: "invoiceDiscount" as DocKey, v: -doc.discountMinor }] : []),
    ...(doc.discountMinor > 0 ? [{ k: "taxable" as DocKey, v: doc.subtotalMinor - doc.discountMinor }] : []),
    { k: "vatTotal", v: doc.vatMinor },
    { k: "total", v: doc.totalMinor, strong: true },
    ...(!isCredit && !isDraft && doc.paidMinor > 0 ? [{ k: "paid" as DocKey, v: doc.paidMinor }] : []),
    ...(!isCredit && !isDraft && doc.balanceMinor > 0 ? [{ k: "balance" as DocKey, v: doc.balanceMinor, strong: true }] : []),
  ];

  if (format === "receipt") {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <style>{css}</style>
        {toolbar}
        <article className="invoice-sheet w-[80mm] max-w-full bg-white px-[4mm] py-[5mm] font-[family-name:var(--font-body)] text-[11px] leading-snug text-black shadow-[var(--shadow-lg)]">
          <header className="flex flex-col items-center gap-1 border-b border-dashed border-black/50 pb-2 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/wordmark.svg" alt="Lunia" className="h-6" />
            <p className="font-semibold">{s.sellerNameEn}</p>
            <p dir="rtl" lang="ar" className="font-semibold">
              {s.sellerNameAr}
            </p>
            <p>{addressEn}</p>
            <p>
              <L k="vatNumber" />: {s.vatNumber || "—"}
            </p>
            <p className="mt-1 flex flex-col text-[12px] font-bold">{title}</p>
            {isDraft && <p className="font-bold">{en.invoices.doc.draft}</p>}
          </header>
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 border-b border-dashed border-black/50 py-2">
            <dt>
              <L k={isCredit ? "creditNumber" : "number"} stacked />
            </dt>
            <dd className="text-end font-mono">{doc.number}</dd>
            <dt>
              <L k="date" stacked />
            </dt>
            <dd className="text-end">{riyadh(doc.issuedAt)}</dd>
            <dt>
              <L k="customer" stacked />
            </dt>
            <dd className="text-end">{doc.customerName}</dd>
            {doc.original && (
              <>
                <dt>
                  <L k="originalInvoice" stacked />
                </dt>
                <dd className="text-end font-mono">{doc.original.number}</dd>
              </>
            )}
          </dl>
          <ul className="border-b border-dashed border-black/50 py-2">
            {doc.lines.map((l) => (
              <li key={l.id} className="py-1">
                <p>{l.nameEn}</p>
                {l.nameAr && (
                  <p dir="rtl" lang="ar">
                    {l.nameAr}
                  </p>
                )}
                <p className="flex justify-between tabular-nums">
                  <span>
                    {l.qty} × {formatAmount(l.unitPriceMinor)}
                    {l.discountMinor > 0 && ` − ${formatAmount(l.discountMinor)}`} + {l.vatRateBp / 100}%
                  </span>
                  <span>{formatAmount(l.totalMinor)}</span>
                </p>
              </li>
            ))}
          </ul>
          <dl className="flex flex-col gap-0.5 py-2">
            {totals.map((t) => (
              <div key={t.k} className={`flex items-start justify-between gap-2 ${t.strong ? "text-[12px] font-bold" : ""}`}>
                <dt>
                  <L k={t.k} stacked />
                </dt>
                <dd className="tabular-nums">{formatAmount(t.v)}</dd>
              </div>
            ))}
          </dl>
          {doc.qrSvg && <div className="mx-auto mt-2 w-[40mm]" dangerouslySetInnerHTML={{ __html: doc.qrSvg }} />}
          <p className="mt-2 text-center">
            <L k="thankYou" stacked />
          </p>
        </article>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      <style>{css}</style>
      {toolbar}
      <article className="invoice-sheet relative w-[210mm] max-w-full bg-white p-[12mm] font-[family-name:var(--font-body)] text-[12px] leading-relaxed text-[#1c2b29] shadow-[var(--shadow-lg)]">
        {isDraft && (
          <p className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-1 text-center font-semibold text-red-700">
            {en.invoices.doc.draft} · <span dir="rtl">{ar.invoices.doc.draft}</span>
          </p>
        )}
        <header className="grid grid-cols-[1fr_auto_1fr] items-start gap-6 border-b-2 border-[var(--color-forest)] pb-5">
          <div className="flex flex-col gap-0.5">
            <p className="text-[14px] font-semibold">{s.sellerNameEn || s.sellerNameAr}</p>
            <p>{addressEn}</p>
            {s.additionalNo && <p>Additional no. {s.additionalNo}</p>}
            <p>
              {en.invoices.doc.vatNumber}: <span className="font-mono">{s.vatNumber || "—"}</span>
            </p>
            <p>
              {en.invoices.doc.crNumber}: <span className="font-mono">{s.crNumber || "—"}</span>
            </p>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/wordmark.svg" alt="Lunia" className="h-9" />
          <div dir="rtl" lang="ar" className="flex flex-col gap-0.5 text-right font-[family-name:var(--font-body-ar)]">
            <p className="text-[14px] font-semibold">{s.sellerNameAr || s.sellerNameEn}</p>
            <p>{[s.buildingNo, s.street, s.district, s.city, s.postalCode].filter(Boolean).join("، ")}</p>
            <p>
              {ar.invoices.doc.vatNumber}: <span className="font-mono">{s.vatNumber || "—"}</span>
            </p>
            <p>
              {ar.invoices.doc.crNumber}: <span className="font-mono">{s.crNumber || "—"}</span>
            </p>
          </div>
        </header>

        <h1 className="my-5 flex items-center justify-center gap-4 rounded bg-[var(--color-forest)] py-2 text-[16px] font-semibold text-white">{title}</h1>

        <section className="grid grid-cols-[1fr_auto] gap-6">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-black/60">
              <L k={isCredit ? "creditNumber" : "number"} />
            </dt>
            <dd className="font-mono font-semibold">{doc.number}</dd>
            <dt className="text-black/60">
              <L k="date" />
            </dt>
            <dd>{riyadh(doc.issuedAt)}</dd>
            <dt className="text-black/60">
              <L k="customer" />
            </dt>
            <dd>
              {doc.customerName}
              {doc.customerPhone && <span className="ms-2 text-black/55">{doc.customerPhone}</span>}
            </dd>
            {doc.customerVatNumber && (
              <>
                <dt className="text-black/60">
                  <L k="customerVat" />
                </dt>
                <dd className="font-mono">{doc.customerVatNumber}</dd>
              </>
            )}
            {doc.original && (
              <>
                <dt className="text-black/60">
                  <L k="originalInvoice" />
                </dt>
                <dd className="font-mono">
                  {doc.original.number} ({riyadh(doc.original.issuedAt)})
                </dd>
              </>
            )}
            {isCredit && doc.notes && (
              <>
                <dt className="text-black/60">
                  <L k="reason" />
                </dt>
                <dd>{doc.notes}</dd>
              </>
            )}
          </dl>
          {doc.qrSvg && <div className="w-[34mm]" dangerouslySetInnerHTML={{ __html: doc.qrSvg }} />}
        </section>

        <table className="mt-6 w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-[var(--color-ice)] text-left align-bottom">
              <th className="border border-black/15 px-2 py-1.5 font-semibold">
                <L k="description" stacked />
              </th>
              <th className="border border-black/15 px-2 py-1.5 text-right font-semibold">
                <L k="qty" stacked />
              </th>
              <th className="border border-black/15 px-2 py-1.5 text-right font-semibold">
                <L k="unitPrice" stacked />
              </th>
              <th className="border border-black/15 px-2 py-1.5 text-right font-semibold">
                <L k="discount" stacked />
              </th>
              <th className="border border-black/15 px-2 py-1.5 text-right font-semibold">
                <L k="vatRate" stacked />
              </th>
              <th className="border border-black/15 px-2 py-1.5 text-right font-semibold">
                <L k="vat" stacked />
              </th>
              <th className="border border-black/15 px-2 py-1.5 text-right font-semibold">
                <L k="lineTotal" stacked />
              </th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.id} className="align-top">
                <td className="border border-black/15 px-2 py-1.5">
                  <div>{l.nameEn}</div>
                  {l.nameAr && (
                    <div dir="rtl" lang="ar" className="text-black/70">
                      {l.nameAr}
                    </div>
                  )}
                </td>
                <td className="border border-black/15 px-2 py-1.5 text-right tabular-nums">{l.qty}</td>
                <td className="border border-black/15 px-2 py-1.5 text-right tabular-nums">{formatAmount(l.unitPriceMinor)}</td>
                <td className="border border-black/15 px-2 py-1.5 text-right tabular-nums">{l.discountMinor ? formatAmount(l.discountMinor) : "—"}</td>
                <td className="border border-black/15 px-2 py-1.5 text-right tabular-nums">{l.vatRateBp / 100}%</td>
                <td className="border border-black/15 px-2 py-1.5 text-right tabular-nums">{formatAmount(l.vatMinor)}</td>
                <td className="border border-black/15 px-2 py-1.5 text-right tabular-nums">{formatAmount(l.totalMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[10px] text-black/50">
          <L k="currency" />
        </p>

        <section className="mt-5 grid grid-cols-2 gap-8">
          <div className="text-[11px]">
            {doc.groups.length > 0 && (
              <table className="w-full border-collapse">
                <tbody>
                  {doc.groups.map((g) => (
                    <tr key={g.vatRateBp}>
                      <td className="border border-black/15 px-2 py-1">
                        <L k="vatAt" vars={{ rate: String(g.vatRateBp / 100) }} />
                      </td>
                      <td className="border border-black/15 px-2 py-1 text-right tabular-nums">{formatAmount(g.taxableMinor)}</td>
                      <td className="border border-black/15 px-2 py-1 text-right tabular-nums">{formatAmount(g.vatMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!isCredit && doc.notes && <p className="mt-3 whitespace-pre-wrap text-black/70">{doc.notes}</p>}
          </div>
          <dl className="flex flex-col">
            {totals.map((t) => (
              <div
                key={t.k}
                className={`flex items-baseline justify-between gap-3 border-b border-black/10 py-1.5 ${t.strong ? "text-[13px] font-bold" : ""}`}
              >
                <dt>
                  <L k={t.k} />
                </dt>
                <dd className="tabular-nums">{formatAmount(t.v)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="mt-10 border-t border-black/10 pt-3 text-center text-[11px] text-black/55">
          <L k="thankYou" />
        </footer>
      </article>
    </div>
  );
}
