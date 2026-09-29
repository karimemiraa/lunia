"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { draftAmounts, formatAmount, parseSarToMinor } from "@/modules/billing/money";
import type { CatalogHit, ClientHit } from "@/modules/billing/lookup";
import { issueInvoiceAction, saveDraftAction, searchCatalogAction, searchClientsAction, voidDraftAction } from "./actions";
import { ConfirmDialog, ConfirmButton } from "../_ui/ConfirmDialog";
import { InlineStatus, Notice, Spinner, useUnsavedChanges } from "../_ui/Form";
import { Field, TextareaField } from "../_ui/Field";
import { MoneyInput } from "../_ui/MoneyInput";
import { Stepper, SectionCard } from "../_ui/Layout";
import { StatusPill } from "../_ui/StatusPill";
import { POS_STEPS } from "./ui";

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
  /** Most-sold items for the quick tiles. */
  quickPicks?: CatalogHit[];
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

const inputCls = "lunia-input min-h-11 text-base md:text-sm";

/**
 * Front-desk point of sale. Left: scan/search box (focused by default), quick
 * tiles and the line editor; right: sticky customer + totals + the one
 * primary action (Issue). Keyboard-first: Enter adds the top hit, "+"/"-"
 * in the scan box bump the last line's quantity.
 */
export function InvoiceEditor({ invoiceId, initial, pricesIncludeVat, defaultVatRateBp, settingsIssues, quickPicks = [] }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shortage, setShortage] = useState<{ id: string; message: string } | null>(null);

  const [clientProfileId, setClientProfileId] = useState(initial.clientProfileId);
  const [customerName, setCustomerName] = useState(initial.customerName);
  const [customerPhone, setCustomerPhone] = useState(initial.customerPhone);
  const [customerVat, setCustomerVat] = useState(initial.customerVatNumber);
  const [notes, setNotes] = useState(initial.notes);
  const [showNotes, setShowNotes] = useState(!!initial.notes);
  const [rows, setRows] = useState<RowState[]>(() => initial.lines.map(toRow));
  const [invoiceDiscount, setInvoiceDiscount] = useState(toInput(initial.invoiceDiscountMinor));
  const [saved, setSaved] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const lastAdded = useRef<number | null>(null);

  // Unsaved-changes guard: anything different from what the page loaded.
  const omitKey = (k: string, v: unknown) => (k === "key" ? undefined : v);
  const snapshot = JSON.stringify({ clientProfileId, customerName, customerPhone, customerVat, notes, invoiceDiscount, rows }, omitKey);
  const initialSnapshot = useMemo(
    () =>
      JSON.stringify({
        clientProfileId: initial.clientProfileId,
        customerName: initial.customerName,
        customerPhone: initial.customerPhone,
        customerVat: initial.customerVatNumber,
        notes: initial.notes,
        invoiceDiscount: toInput(initial.invoiceDiscountMinor),
        rows: initial.lines.map(toRow),
      }, omitKey),
    [initial],
  );
  const dirty = snapshot !== initialSnapshot && !pending;
  useUnsavedChanges(dirty);

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

  function bumpQty(key: number, delta: number) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, qty: String(Math.max(1, (Number.parseInt(r.qty, 10) || 0) + delta)) } : r)));
  }

  function addHit(hit: CatalogHit) {
    setSaved(null);
    setRows((rs) => {
      // Scanning the same product twice increments instead of duplicating.
      const existing = hit.kind === "PRODUCT" ? rs.find((r) => r.productId === hit.id) : undefined;
      if (existing) {
        lastAdded.current = existing.key;
        return rs.map((r) => (r === existing ? { ...r, qty: String((Number.parseInt(r.qty, 10) || 0) + 1) } : r));
      }
      const row = toRow({
        kind: hit.kind,
        serviceId: hit.kind === "SERVICE" ? hit.id : null,
        productId: hit.kind === "PRODUCT" ? hit.id : null,
        description: hit.name,
        qty: 1,
        unitPriceMinor: hit.priceMinor,
        discountMinor: 0,
        vatRateBp: hit.vatRateBp,
        stockQty: hit.stockQty,
      });
      lastAdded.current = row.key;
      return [...rs, row];
    });
  }

  function addCustom(kind: "OTHER" | "GIFT_CARD") {
    const row = toRow({
      kind,
      description: kind === "GIFT_CARD" ? "Gift card" : "",
      qty: 1,
      unitPriceMinor: 0,
      discountMinor: 0,
      // Vouchers carry no VAT at sale; VAT is charged when they're redeemed.
      vatRateBp: kind === "GIFT_CARD" ? 0 : defaultVatRateBp,
    });
    lastAdded.current = row.key;
    setRows((rs) => [...rs, row]);
    // A custom line has no description yet — take the cursor there.
    setTimeout(() => document.getElementById(`line-desc-${row.key}`)?.focus(), 0);
  }

  function bumpLast(delta: number) {
    const key = lastAdded.current ?? rows[rows.length - 1]?.key;
    if (key !== undefined) bumpQty(key, delta);
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
    setSaved(null);
    let data;
    try {
      data = payload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid input");
      return;
    }
    if (thenIssue && data.lines.length === 0) {
      setError("Add at least one line before issuing.");
      scanRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const savedRes = await saveDraftAction(invoiceId, data);
      if (!savedRes.ok) {
        setError(savedRes.error);
        return;
      }
      if (thenIssue) {
        const res = await issueInvoiceAction(savedRes.id);
        if (!res.ok && res.stockShortage) {
          setShortage({ id: savedRes.id, message: res.error });
          return;
        }
        if (!res.ok) {
          setError(res.error);
          if (!invoiceId) router.push(`/admin/billing/${savedRes.id}`);
          return;
        }
      }
      if (!invoiceId || thenIssue) router.push(`/admin/billing/${savedRes.id}`);
      else setSaved("Draft saved.");
      router.refresh();
    });
  }

  function issueAnyway() {
    const id = shortage?.id;
    setShortage(null);
    if (!id) return;
    startTransition(async () => {
      const res = await issueInvoiceAction(id, true);
      if (!res.ok) {
        setError(res.error);
        if (!invoiceId) router.push(`/admin/billing/${id}`);
        return;
      }
      router.push(`/admin/billing/${id}`);
      router.refresh();
    });
  }

  function voidIt() {
    if (!invoiceId) return;
    startTransition(async () => {
      const res = await voidDraftAction(invoiceId);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  const totals = "totals" in parsed ? parsed.totals : null;
  const canIssue = !pending && settingsIssues.length === 0 && rows.length > 0 && !!totals;

  return (
    <div className="flex flex-col gap-5">
      <Stepper steps={POS_STEPS} current={0} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        {/* ---------- Left: build the sale ---------- */}
        <div className="flex flex-col gap-5">
          <SectionCard title="Add items" description={`Prices entered ${pricesIncludeVat ? "including" : "excluding"} VAT (tax settings).`}>
            <ScanBox ref={scanRef} onAdd={addHit} onBump={bumpLast} />
            {quickPicks.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-ink)]/50">Most sold</p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                  {quickPicks.map((h) => (
                    <button
                      key={`${h.kind}-${h.id}`}
                      type="button"
                      onClick={() => {
                        addHit(h);
                        scanRef.current?.focus();
                      }}
                      className="flex min-h-[4.25rem] flex-col items-start justify-between gap-1 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-start transition-colors hover:border-[var(--color-teal)] hover:bg-[var(--color-teal)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)]"
                    >
                      <span className="line-clamp-2 text-sm font-medium leading-snug text-[var(--color-ink)]">{h.name}</span>
                      <span className="flex w-full items-center justify-between gap-2 text-xs text-[var(--color-ink)]/55">
                        <span>{KIND_LABEL[h.kind]}</span>
                        <span className="tabular-nums">{formatAmount(h.priceMinor)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => addCustom("OTHER")} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
                Custom line
              </button>
              <button type="button" onClick={() => addCustom("GIFT_CARD")} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
                Gift card sale
              </button>
            </div>
          </SectionCard>

          <SectionCard title={`Lines${rows.length ? ` (${rows.length})` : ""}`} padded={false}>
            {rows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-[var(--color-ink)]/55">Scan a barcode, search the catalog or tap a tile to add the first line.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-[var(--line)]">
                {rows.map((r, i) => {
                  const computed = totals?.lines[i];
                  const lowStock = r.kind === "PRODUCT" && r.stockQty !== undefined && Number(r.qty) > r.stockQty;
                  const qtyNum = Number.parseInt(r.qty, 10) || 1;
                  return (
                    <li key={r.key} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_8.5rem_7.5rem_7rem_5.5rem_6.5rem_2.75rem] md:items-end">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-xs text-[var(--color-ink)]/55">
                          <StatusPill tone={r.kind === "PRODUCT" ? "info" : r.kind === "GIFT_CARD" ? "accent" : "neutral"}>{KIND_LABEL[r.kind]}</StatusPill>
                          {lowStock && <span className="font-medium text-[var(--status-danger-ink)]">Only {r.stockQty} in stock</span>}
                        </div>
                        <input
                          id={`line-desc-${r.key}`}
                          aria-label={`Line ${i + 1} description`}
                          value={r.description}
                          placeholder={r.kind === "OTHER" ? "Describe the item" : undefined}
                          onChange={(e) => update(r.key, { description: e.target.value })}
                          className={inputCls}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:contents">
                        <div className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/55">
                          <span id={`qty-label-${r.key}`}>Qty</span>
                          <div className="flex items-stretch overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line-strong)]" role="group" aria-labelledby={`qty-label-${r.key}`}>
                            <button type="button" aria-label="Decrease quantity" onClick={() => bumpQty(r.key, -1)} disabled={qtyNum <= 1} className="min-h-11 w-10 shrink-0 text-lg text-[var(--color-ink)]/70 hover:bg-[var(--surface-2)] disabled:opacity-30">
                              −
                            </button>
                            <input
                              inputMode="numeric"
                              aria-label={`Line ${i + 1} quantity`}
                              value={r.qty}
                              onChange={(e) => update(r.key, { qty: e.target.value.replace(/\D/g, "") })}
                              onKeyDown={(e) => {
                                if (e.key === "ArrowUp" || e.key === "+") {
                                  e.preventDefault();
                                  bumpQty(r.key, 1);
                                } else if (e.key === "ArrowDown" || e.key === "-") {
                                  e.preventDefault();
                                  bumpQty(r.key, -1);
                                }
                              }}
                              className="min-h-11 w-full min-w-0 border-x border-[var(--line)] bg-[var(--surface)] text-center text-base tabular-nums focus:outline-none md:text-sm"
                            />
                            <button type="button" aria-label="Increase quantity" onClick={() => bumpQty(r.key, 1)} className="min-h-11 w-10 shrink-0 text-lg text-[var(--color-ink)]/70 hover:bg-[var(--surface-2)]">
                              +
                            </button>
                          </div>
                        </div>
                        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/55">
                          Unit price
                          <input inputMode="decimal" value={r.price} onChange={(e) => update(r.key, { price: e.target.value })} placeholder="0.00" className={`${inputCls} text-end tabular-nums`} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/55">
                          Discount
                          <input inputMode="decimal" value={r.discount} onChange={(e) => update(r.key, { discount: e.target.value })} placeholder="0.00" className={`${inputCls} text-end tabular-nums`} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/55">
                          VAT
                          <select value={r.vatRateBp} onChange={(e) => update(r.key, { vatRateBp: Number(e.target.value) })} className={inputCls}>
                            <option value={defaultVatRateBp}>{defaultVatRateBp / 100}%</option>
                            {defaultVatRateBp !== 0 && <option value={0}>0%</option>}
                          </select>
                        </label>
                      </div>
                      <div className="flex items-center justify-between gap-2 md:contents">
                        <p className="text-end text-sm font-medium tabular-nums md:pb-3">
                          {computed ? formatAmount(computed.totalMinor) : "—"}
                          <span className="block text-[0.65rem] font-normal text-[var(--color-ink)]/45">incl. VAT</span>
                        </p>
                        <button
                          type="button"
                          aria-label={`Remove line ${i + 1}`}
                          onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink)]/50 transition-colors hover:bg-[var(--status-danger-bg)] hover:text-[var(--status-danger-ink)] md:mb-1"
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
          </SectionCard>
        </div>

        {/* ---------- Right: customer, totals, actions ---------- */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
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

          <SectionCard title="Totals">
            <div className="flex flex-col gap-3">
              <MoneyInput label="Invoice discount" value={invoiceDiscount} onChange={(t) => setInvoiceDiscount(t)} vat={pricesIncludeVat ? "incl" : "excl"} />
              {showNotes ? (
                <TextareaField label="Notes (printed on the invoice)" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              ) : (
                <button type="button" onClick={() => setShowNotes(true)} className="self-start text-sm text-[var(--color-teal-ink)] underline-offset-4 hover:underline">
                  Add a note
                </button>
              )}
              <div className="flex flex-col gap-1.5 border-t border-[var(--line)] pt-3 text-sm">
                {totals ? (
                  <>
                    <Row label="Subtotal (excl. VAT)" value={totals.subtotalMinor} />
                    {totals.discountMinor > 0 && <Row label="Invoice discount" value={-totals.discountMinor} />}
                    <Row label="Taxable amount" value={totals.taxableMinor} />
                    <Row label="VAT" value={totals.vatMinor} />
                    <div className="mt-1 flex items-baseline justify-between border-t border-[var(--line)] pt-3">
                      <span className="font-medium">Total incl. VAT</span>
                      <span className="text-2xl font-medium tabular-nums">
                        {formatAmount(totals.totalMinor)} <span className="text-sm text-[var(--color-ink)]/55">SAR</span>
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[var(--status-danger-ink)]">{"error" in parsed ? parsed.error : ""}</p>
                )}
              </div>

              {error && <InlineStatus error={error} />}
              {saved && <InlineStatus success={saved} />}
              {settingsIssues.length > 0 && (
                <Notice>
                  Issuing is blocked until the tax settings are complete: {settingsIssues.join(", ")}.{" "}
                  <Link href="/admin/billing/settings" className="font-medium underline">
                    Open tax settings
                  </Link>
                </Notice>
              )}

              <div className="flex flex-col gap-2 pt-1">
                <button type="button" disabled={!canIssue} onClick={() => save(true)} aria-busy={pending || undefined} className="lunia-btn lunia-btn-forest min-h-12 w-full text-base disabled:cursor-not-allowed disabled:opacity-50">
                  {pending && <Spinner />}
                  Issue invoice
                </button>
                <button type="button" disabled={pending} onClick={() => save(false)} className="lunia-btn lunia-btn-forest-outline min-h-11 w-full disabled:opacity-50">
                  Save draft
                </button>
              </div>
            </div>
          </SectionCard>

          {invoiceId && (
            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--line-strong)] px-4 py-3 text-xs text-[var(--color-ink)]/60">
              <span>Not going ahead? The draft is kept for the record.</span>
              <ConfirmButton title="Void this draft?" description="It stays in the list as void and can no longer be issued. Nothing is charged." confirmLabel="Void draft" onConfirm={voidIt} pending={pending}>
                Void draft
              </ConfirmButton>
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={!!shortage}
        title="Not enough stock"
        description={`${shortage?.message ?? ""} Issue anyway and let stock go negative?`}
        confirmLabel="Issue anyway"
        danger
        pending={pending}
        onConfirm={issueAnyway}
        onCancel={() => setShortage(null)}
      />
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

function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

interface ScanBoxProps {
  onAdd: (hit: CatalogHit) => void;
  onBump: (delta: number) => void;
  ref: React.Ref<HTMLInputElement>;
}

function ScanBox({ onAdd, onBump, ref }: ScanBoxProps) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<CatalogHit[]>([]);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const debounced = useDebounced(q);
  const reqId = useRef(0);
  const listId = "pos-scan-results";

  useEffect(() => {
    if (!open) return;
    const id = ++reqId.current;
    searchCatalogAction(debounced).then((res) => {
      if (id === reqId.current) {
        setHits(res);
        setActive(0);
      }
    });
  }, [debounced, open]);

  function pick(h: CatalogHit) {
    onAdd(h);
    setQ("");
    setActive(0);
  }

  async function onEnter() {
    const term = q.trim();
    if (!term) return;
    // Barcode scanners type fast and press Enter before the debounce fires:
    // resolve the exact term now instead of adding a stale hit.
    setBusy(true);
    const res = await searchCatalogAction(term);
    setBusy(false);
    const hit = res[active] ?? res[0];
    if (hit) pick(hit);
    else setHits([]);
  }

  return (
    <div className="relative">
      <Field
        ref={ref}
        label="Scan barcode or search the catalog"
        name="scan"
        type="search"
        autoFocus
        autoComplete="off"
        placeholder="Barcode, product, service or package…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void onEnter();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(hits.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if ((e.key === "+" || e.key === "-") && !q) {
            e.preventDefault();
            onBump(e.key === "+" ? 1 : -1);
          } else if (e.key === "Escape") {
            setQ("");
          }
        }}
        inputClassName="min-h-12 text-base"
        prefix={
          busy ? (
            <Spinner />
          ) : (
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
              <path strokeLinecap="round" d="M4 7V5h2M4 17v2h2m14-12V5h-2m2 12v2h-2M8 8v8m3-8v8m3-8v8m2-8v8" />
            </svg>
          )
        }
        help="Enter adds the highlighted item. With the box empty, + and − change the last line's quantity."
      />
      {open && hits.length > 0 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-[4.6rem] z-20 max-h-80 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-lg)]">
          {hits.map((h, i) => (
            <li key={`${h.kind}-${h.id}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(h)}
                className={`flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-start text-sm ${i === active ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]"}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <StatusPill tone={h.kind === "PRODUCT" ? "info" : "neutral"}>{KIND_LABEL[h.kind]}</StatusPill>
                  <span className="truncate">{h.name}</span>
                  {h.kind === "PRODUCT" && <span className="shrink-0 text-xs text-[var(--color-ink)]/45">{h.stockQty} in stock</span>}
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
  const [more, setMore] = useState(!!props.vat);
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
    <SectionCard
      title="Customer"
      actions={
        props.clientProfileId ? (
          <span className="flex items-center gap-2">
            <Link href={`/admin/clients/${props.clientProfileId}`} className="rounded-full bg-[var(--color-teal)]/20 px-2.5 py-1 text-xs font-medium text-[var(--color-teal-ink)]">
              Linked profile
            </Link>
            <button type="button" onClick={() => props.onPick(null)} className="min-h-11 px-2 text-xs text-[var(--color-ink)]/60 underline-offset-4 hover:underline">
              Unlink
            </button>
          </span>
        ) : (
          <StatusPill tone="neutral">Walk-in</StatusPill>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {!props.clientProfileId && (
          <div className="relative">
            <Field label="Find a customer" name="customer-search" type="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or email" />
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
                      className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2 text-start text-sm hover:bg-[var(--surface-2)]"
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
        <Field label="Name on invoice" name="customerName" value={props.name} onChange={(e) => props.onName(e.target.value)} placeholder="Walk-in customer" autoComplete="off" />
        <Field label="Phone" name="customerPhone" type="tel" inputMode="tel" autoComplete="off" value={props.phone} onChange={(e) => props.onPhone(e.target.value)} help="Needed to send the invoice by WhatsApp or SMS." />
        {more ? (
          <Field label="Customer VAT no." name="customerVat" inputMode="numeric" pattern="3\d{13}3" value={props.vat} onChange={(e) => props.onVat(e.target.value)} placeholder="3xxxxxxxxxxxxx3" help="Businesses only — 15 digits starting and ending in 3." />
        ) : (
          <button type="button" onClick={() => setMore(true)} className="self-start text-sm text-[var(--color-teal-ink)] underline-offset-4 hover:underline">
            Add a business VAT number
          </button>
        )}
      </div>
    </SectionCard>
  );
}
