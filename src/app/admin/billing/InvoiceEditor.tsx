"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { draftAmounts, formatAmount, parseSarToMinor } from "@/modules/billing/money";
import type { CatalogHit, ClientHit } from "@/modules/billing/lookup";
import { issueInvoiceAction, saveDraftAction, searchCatalogAction, searchClientsAction, voidDraftAction } from "./actions";

type Kind = "SERVICE" | "PRODUCT" | "PACKAGE" | "GIFT_CARD" | "OTHER";

export interface EditorLine {
  kind: Kind;
  serviceId?: string | null;
  productId?: string | null;
  description: string;
  qty: number;
  /** Entered unit price (VAT-inclusive when pricesIncludeVat). */
  unitPriceMinor: number;
  discountMinor: number;
  vatRateBp: number;
  stockQty?: number;
}

export interface EditorInitial {
  clientProfileId: string | null;
  bookingId: string | null;
  customerName: string;
  customerPhone: string;
  customerVatNumber: string;
  notes: string;
  lines: EditorLine[];
  invoiceDiscountMinor: number;
}

interface Props {
  invoiceId: string | null;
  initial: EditorInitial;
  pricesIncludeVat: boolean;
  defaultVatRateBp: number;
  /** Seller settings incomplete → issuing is blocked (with this hint). */
  settingsIssues: string[];
}

interface RowState extends Omit<EditorLine, "qty" | "unitPriceMinor" | "discountMinor"> {
  key: number;
  qty: string;
  price: string;
  discount: string;
}

const KIND_LABEL: Record<Kind, string> = { SERVICE: "Service", PRODUCT: "Product", PACKAGE: "Package", GIFT_CARD: "Gift card", OTHER: "Custom" };

const toInput = (minor: number) => (minor ? (minor / 100).toFixed(2) : "");
let keySeq = 0;

function toRow(l: EditorLine): RowState {
  return { ...l, key: ++keySeq, qty: String(l.qty), price: toInput(l.unitPriceMinor), discount: toInput(l.discountMinor) };
}

export function InvoiceEditor({ invoiceId, initial, pricesIncludeVat, defaultVatRateBp, settingsIssues }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [clientProfileId, setClientProfileId] = useState(initial.clientProfileId);
  const [customerName, setCustomerName] = useState(initial.customerName);
  const [customerPhone, setCustomerPhone] = useState(initial.customerPhone);
  const [customerVat, setCustomerVat] = useState(initial.customerVatNumber);
  const [notes, setNotes] = useState(initial.notes);
  const [rows, setRows] = useState<RowState[]>(() => initial.lines.map(toRow));
  const [invoiceDiscount, setInvoiceDiscount] = useState(toInput(initial.invoiceDiscountMinor));

  // --- live preview (same math as the server) ---
  const parsed = useMemo(() => {
    const lines = rows.map((r) => ({
      qty: Number.parseInt(r.qty, 10),
      unitPriceMinor: parseSarToMinor(r.price || "0"),
      discountMinor: parseSarToMinor(r.discount || "0"),
      vatRateBp: r.vatRateBp,
    }));
    const bad = lines.findIndex((l) => !Number.isInteger(l.qty) || l.qty <= 0 || l.unitPriceMinor === null || l.discountMinor === null);
    const disc = parseSarToMinor(invoiceDiscount || "0");
    if (bad >= 0) return { error: `Check line ${bad + 1}: quantity and amounts must be valid numbers.` };
    if (disc === null) return { error: "Invoice discount must be an amount like 50 or 49.50." };
    try {
      const clean = lines as { qty: number; unitPriceMinor: number; discountMinor: number; vatRateBp: number }[];
      return { lines: clean, discount: disc, ...draftAmounts(clean, disc, pricesIncludeVat) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Invalid amounts" };
    }
  }, [rows, invoiceDiscount, pricesIncludeVat]);

  function update(key: number, patch: Partial<RowState>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addHit(hit: CatalogHit) {
    setRows((rs) => [
      ...rs,
      toRow({
        kind: hit.kind,
        serviceId: hit.kind === "SERVICE" ? hit.id : null,
        productId: hit.kind === "PRODUCT" ? hit.id : null,
        description: hit.name,
        qty: 1,
        unitPriceMinor: hit.priceMinor,
        discountMinor: 0,
        vatRateBp: hit.vatRateBp,
        stockQty: hit.stockQty,
      }),
    ]);
  }

  function addCustom(kind: "OTHER" | "GIFT_CARD") {
    setRows((rs) => [
      ...rs,
      toRow({
        kind,
        description: kind === "GIFT_CARD" ? "Gift card" : "",
        qty: 1,
        unitPriceMinor: 0,
        discountMinor: 0,
        // Vouchers carry no VAT at sale; VAT is charged when they're redeemed.
        vatRateBp: kind === "GIFT_CARD" ? 0 : defaultVatRateBp,
      }),
    ]);
  }

  function payload() {
    if ("error" in parsed) throw new Error(parsed.error);
    return {
      clientProfileId,
      bookingId: initial.bookingId,
      customerName,
      customerPhone: customerPhone || null,
      customerVatNumber: customerVat || null,
      notes: notes || null,
      pricesIncludeVat,
      invoiceDiscountMinor: parsed.discount,
      lines: rows.map((r, i) => ({
        kind: r.kind,
        serviceId: r.serviceId ?? null,
        productId: r.productId ?? null,
        description: r.description.trim() || KIND_LABEL[r.kind],
        qty: parsed.lines[i]!.qty,
        unitPriceMinor: parsed.lines[i]!.unitPriceMinor,
        discountMinor: parsed.lines[i]!.discountMinor,
        vatRateBp: r.vatRateBp,
      })),
    };
  }

  function save(thenIssue: boolean) {
    setError(null);
    let data;
    try {
      data = payload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid input");
      return;
    }
    if (thenIssue && data.lines.length === 0) {
      setError("Add at least one line before issuing.");
      return;
    }
    startTransition(async () => {
      const saved = await saveDraftAction(invoiceId, data);
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      if (thenIssue) {
        let res = await issueInvoiceAction(saved.id);
        if (!res.ok && res.stockShortage && confirm(`${res.error}\n\nIssue anyway and let stock go negative?`)) {
          res = await issueInvoiceAction(saved.id, true);
        }
        if (!res.ok) {
          setError(res.error);
          if (!invoiceId) router.push(`/admin/billing/${saved.id}`);
          return;
        }
      }
      if (!invoiceId || thenIssue) router.push(`/admin/billing/${saved.id}`);
      router.refresh();
    });
  }

  function voidIt() {
    if (!invoiceId || !confirm("Void this draft? It will be kept for the record but can't be issued.")) return;
    startTransition(async () => {
      const res = await voidDraftAction(invoiceId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  const totals = "totals" in parsed ? parsed.totals : null;

  return (
    <div className="flex flex-col gap-6">
      <CustomerPicker
        clientProfileId={clientProfileId}
        name={customerName}
        phone={customerPhone}
        vat={customerVat}
        onPick={(c) => {
          setClientProfileId(c?.id ?? null);
          if (c) {
            setCustomerName(c.name);
            setCustomerPhone(c.phone ?? "");
          }
        }}
        onName={setCustomerName}
        onPhone={setCustomerPhone}
        onVat={setCustomerVat}
      />

      <section className="lunia-card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Lines</h2>
          <span className="text-xs text-[var(--color-ink)]/55">
            Prices are entered <strong>{pricesIncludeVat ? "including" : "excluding"}</strong> VAT (tax settings)
          </span>
        </div>

        <CatalogSearch onAdd={addHit} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => addCustom("OTHER")} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-[44px]">
            + Custom line
          </button>
          <button type="button" onClick={() => addCustom("GIFT_CARD")} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-[44px]">
            + Gift card sale
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">
            Search above to add services, products or packages.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--line)]">
            {rows.map((r, i) => {
              const computed = totals?.lines[i];
              const lowStock = r.kind === "PRODUCT" && r.stockQty !== undefined && Number(r.qty) > r.stockQty;
              return (
                <li key={r.key} className="grid gap-3 py-3 md:grid-cols-[1fr_5rem_7rem_6rem_5.5rem_7rem_2.75rem] md:items-end">
                  <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/55">
                    <span>
                      {KIND_LABEL[r.kind]}
                      {lowStock && <span className="ms-2 font-medium text-red-700">Only {r.stockQty} in stock</span>}
                    </span>
                    <input value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} className="lunia-input min-h-[44px]" />
                  </label>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:contents">
                    <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/55">
                      Qty
                      <input inputMode="numeric" value={r.qty} onChange={(e) => update(r.key, { qty: e.target.value })} className="lunia-input min-h-[44px] tabular-nums" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/55">
                      Unit price
                      <input inputMode="decimal" value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} placeholder="0.00" className="lunia-input min-h-[44px] tabular-nums" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/55">
                      Discount
                      <input inputMode="decimal" value={r.discount} onChange={(e) => update(r.key, { discount: e.target.value })} placeholder="0.00" className="lunia-input min-h-[44px] tabular-nums" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/55">
                      VAT
                      <select value={r.vatRateBp} onChange={(e) => update(r.key, { vatRateBp: Number(e.target.value) })} className="lunia-input min-h-[44px]">
                        <option value={defaultVatRateBp}>{defaultVatRateBp / 100}%</option>
                        {defaultVatRateBp !== 0 && <option value={0}>0%</option>}
                      </select>
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-2 md:contents">
                    <p className="text-right text-sm font-medium tabular-nums md:pb-3">
                      {computed ? formatAmount(computed.totalMinor) : "—"}
                      <span className="block text-[0.65rem] font-normal text-[var(--color-ink)]/45">incl. VAT</span>
                    </p>
                    <button
                      type="button"
                      aria-label="Remove line"
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink)]/50 hover:bg-red-50 hover:text-red-700"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                        <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
                      </svg>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-[1fr_22rem]">
        <div className="lunia-card flex flex-col gap-3 p-5">
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">
            Invoice discount ({pricesIncludeVat ? "incl." : "excl."} VAT, SAR)
            <input inputMode="decimal" value={invoiceDiscount} onChange={(e) => setInvoiceDiscount(e.target.value)} placeholder="0.00" className="lunia-input min-h-[44px] normal-case tracking-normal tabular-nums" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">
            Notes (printed on the invoice)
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="lunia-input normal-case tracking-normal" />
          </label>
        </div>
        <div className="lunia-card flex flex-col gap-2 p-5 text-sm">
          {totals ? (
            <>
              <Row label="Subtotal (excl. VAT)" value={totals.subtotalMinor} />
              {totals.discountMinor > 0 && <Row label="Invoice discount" value={-totals.discountMinor} />}
              <Row label="Taxable amount" value={totals.taxableMinor} />
              <Row label="VAT" value={totals.vatMinor} />
              <div className="mt-1 flex items-baseline justify-between border-t border-[var(--line)] pt-3">
                <span className="font-medium">Total</span>
                <span className="text-2xl font-medium tabular-nums">{formatAmount(totals.totalMinor)} SAR</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-red-700">{"error" in parsed ? parsed.error : ""}</p>
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="rounded-[var(--radius-sm)] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {settingsIssues.length > 0 && (
        <p className="rounded-[var(--radius-sm)] border border-[var(--color-gold)]/45 bg-[var(--color-gold)]/10 px-4 py-3 text-sm">
          Issuing is blocked until the tax settings are complete: {settingsIssues.join(", ")}.{" "}
          <Link href="/admin/billing/settings" className="font-medium underline">
            Open tax settings
          </Link>
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {invoiceId && (
          <button type="button" disabled={pending} onClick={voidIt} className="lunia-btn lunia-btn-danger min-h-[44px] disabled:opacity-50">
            Void draft
          </button>
        )}
        <button type="button" disabled={pending} onClick={() => save(false)} className="lunia-btn lunia-btn-forest-outline min-h-[44px] disabled:opacity-50">
          {pending ? "Saving…" : "Save draft"}
        </button>
        <button
          type="button"
          disabled={pending || settingsIssues.length > 0}
          onClick={() => save(true)}
          className="lunia-btn lunia-btn-forest min-h-[44px] disabled:opacity-50"
        >
          Save & issue invoice
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--color-ink)]/65">{label}</span>
      <span className="tabular-nums">{formatAmount(value)}</span>
    </div>
  );
}

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function CatalogSearch({ onAdd }: { onAdd: (hit: CatalogHit) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const debounced = useDebounced(q);
  const reqId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++reqId.current;
    searchCatalogAction(debounced).then((res) => {
      if (id === reqId.current) setHits(res);
    });
  }, [debounced, open]);

  return (
    <div className="relative">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Add a service, product (name, SKU or barcode) or package…"
        className="lunia-input min-h-[44px]"
        aria-label="Search catalog"
      />
      {open && hits.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
          {hits.map((h) => (
            <li key={`${h.kind}-${h.id}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onAdd(h);
                  setQ("");
                }}
                className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
              >
                <span className="min-w-0">
                  <span className="me-2 rounded-full bg-[var(--color-ink)]/8 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-[var(--color-ink)]/60">{KIND_LABEL[h.kind]}</span>
                  <span className="truncate">{h.name}</span>
                  {h.kind === "PRODUCT" && <span className="ms-2 text-xs text-[var(--color-ink)]/45">{h.stockQty} in stock</span>}
                </span>
                <span className="shrink-0 tabular-nums text-[var(--color-ink)]/70">{formatAmount(h.priceMinor)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CustomerPicker(props: {
  clientProfileId: string | null;
  name: string;
  phone: string;
  vat: string;
  onPick: (c: ClientHit | null) => void;
  onName: (v: string) => void;
  onPhone: (v: string) => void;
  onVat: (v: string) => void;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ClientHit[]>([]);
  const debounced = useDebounced(q);
  useEffect(() => {
    let live = true;
    if (debounced.trim().length < 2) {
      Promise.resolve([] as ClientHit[]).then((r) => live && setHits(r));
    } else {
      searchClientsAction(debounced).then((r) => live && setHits(r));
    }
    return () => {
      live = false;
    };
  }, [debounced]);

  return (
    <section className="lunia-card flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Customer</h2>
        {props.clientProfileId ? (
          <span className="flex items-center gap-2 text-xs">
            <Link href={`/admin/clients/${props.clientProfileId}`} className="rounded-full bg-[var(--color-teal)]/20 px-2.5 py-1 font-medium text-[var(--color-teal-ink)]">
              Linked to customer profile
            </Link>
            <button type="button" onClick={() => props.onPick(null)} className="min-h-[44px] px-2 text-[var(--color-ink)]/55 underline">
              Unlink
            </button>
          </span>
        ) : (
          <span className="text-xs text-[var(--color-ink)]/50">Walk-in (not linked)</span>
        )}
      </div>
      {!props.clientProfileId && (
        <div className="relative">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a customer by name, phone or email…"
            className="lunia-input min-h-[44px]"
            aria-label="Search customers"
          />
          {hits.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
              {hits.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      props.onPick(c);
                      setQ("");
                    }}
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
                  >
                    <span>{c.name}</span>
                    <span className="text-xs text-[var(--color-ink)]/50">{c.phone ?? c.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/55">
          Name on invoice
          <input value={props.name} onChange={(e) => props.onName(e.target.value)} placeholder="Walk-in customer" className="lunia-input min-h-[44px]" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/55">
          Phone
          <input type="tel" value={props.phone} onChange={(e) => props.onPhone(e.target.value)} className="lunia-input min-h-[44px]" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/55">
          Customer VAT no. (businesses, optional)
          <input inputMode="numeric" value={props.vat} onChange={(e) => props.onVat(e.target.value)} placeholder="3xxxxxxxxxxxxx3" className="lunia-input min-h-[44px]" />
        </label>
      </div>
    </section>
  );
}
