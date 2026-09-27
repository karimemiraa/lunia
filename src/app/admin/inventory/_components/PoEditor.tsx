"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPurchaseOrderAction, suggestReorderAction, updatePurchaseOrderAction } from "../actions";
import { formatSarMinor, minorToSarInput, parseSarToMinor } from "@/modules/inventory/money";
import { labelClass, labelText } from "./ui";

export interface PoProductOption {
  id: string;
  nameEn: string;
  sku: string | null;
  unit: string;
  costMinor: number;
  stockQty: number;
  reorderLevel: number;
  supplierId: string | null;
}

interface Line {
  key: string;
  productId: string;
  qty: string;
  cost: string;
}

interface Props {
  poId?: string;
  suppliers: { id: string; name: string }[];
  products: PoProductOption[];
  initial: { supplierId: string; notes: string; lines: { productId: string; qty: number; unitCostMinor: number }[] };
  /** Pre-fill with reorder suggestions on first load (?suggest=1). */
  autoSuggest?: boolean;
}

let keySeq = 0;
const newKey = () => `l${++keySeq}`;

export function PoEditor({ poId, suppliers, products, initial, autoSuggest }: Props) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(initial.supplierId);
  const [notes, setNotes] = useState(initial.notes);
  const [lines, setLines] = useState<Line[]>(() =>
    initial.lines.map((l) => ({ key: newKey(), productId: l.productId, qty: String(l.qty), cost: minorToSarInput(l.unitCostMinor) })),
  );
  const [picker, setPicker] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const autoRan = useRef(false);

  const byId = new Map(products.map((p) => [p.id, p]));
  const used = new Set(lines.map((l) => l.productId));
  // Products from this supplier first, then everything else.
  const pickable = products
    .filter((p) => !used.has(p.id))
    .sort((a, b) => Number(b.supplierId === supplierId) - Number(a.supplierId === supplierId) || a.nameEn.localeCompare(b.nameEn));

  function addLine(productId: string) {
    const p = byId.get(productId);
    if (!p || used.has(productId)) return;
    setLines((prev) => [...prev, { key: newKey(), productId, qty: "1", cost: minorToSarInput(p.costMinor) }]);
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function suggest() {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await suggestReorderAction(supplierId || undefined);
      if (!result.ok) return setError(result.error);
      const suggestions = result.data!;
      if (suggestions.length === 0) {
        setInfo(supplierId ? "Nothing from this supplier is at or below its reorder level." : "Nothing is at or below its reorder level.");
        return;
      }
      setLines((prev) => {
        const bySuggestion = new Map(suggestions.map((s) => [s.productId, s]));
        // Lines already on the PO keep their cost; qty is raised to the suggestion if lower.
        const merged = prev.map((l) => {
          const s = bySuggestion.get(l.productId);
          return s ? { ...l, qty: String(Math.max(Number(l.qty) || 0, s.qty)) } : l;
        });
        const present = new Set(prev.map((l) => l.productId));
        const added = suggestions
          .filter((s) => !present.has(s.productId))
          .map((s) => ({ key: newKey(), productId: s.productId, qty: String(s.qty), cost: minorToSarInput(s.unitCostMinor) }));
        return [...merged, ...added];
      });
      setInfo(`Suggested ${suggestions.length} product(s) at or below their reorder level, topped up to 2x the reorder level.`);
    });
  }

  useEffect(() => {
    if (autoSuggest && !autoRan.current && lines.length === 0) {
      autoRan.current = true;
      suggest();
    }
    // Only on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsed = lines.map((l) => ({ ...l, qtyN: Number(l.qty), costMinor: parseSarToMinor(l.cost) }));
  const total = parsed.reduce((sum, l) => sum + (Number.isInteger(l.qtyN) && l.costMinor !== null ? l.qtyN * l.costMinor : 0), 0);

  function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!supplierId) return setError("Choose a supplier.");
    if (parsed.length === 0) return setError("Add at least one product.");
    const bad = parsed.find((l) => !Number.isInteger(l.qtyN) || l.qtyN < 1 || l.costMinor === null);
    if (bad) return setError(`Check the quantity and unit cost for ${byId.get(bad.productId)?.nameEn ?? "a line"}.`);
    const payload = { supplierId, notes, lines: parsed.map((l) => ({ productId: l.productId, qty: l.qtyN, unitCostMinor: l.costMinor! })) };
    startTransition(async () => {
      if (poId) {
        const result = await updatePurchaseOrderAction(poId, payload);
        if (!result.ok) return setError(result.error);
        setInfo("Draft saved.");
        router.refresh();
      } else {
        const result = await createPurchaseOrderAction(payload);
        if (!result.ok) return setError(result.error);
        router.push(`/admin/inventory/purchase-orders/${result.data!.id}`);
      }
    });
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <div className="lunia-card grid gap-4 p-5 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={labelText}>Supplier</span>
          <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="lunia-input min-h-11">
            <option value="">Choose a supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          <span className={labelText}>Notes for the supplier</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery instructions, reference…" className="lunia-input min-h-11" />
        </label>
      </div>

      <div className="lunia-card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className={`${labelClass} min-w-[16rem] flex-1`}>
            <span className={labelText}>Add product</span>
            <select
              value={picker}
              onChange={(e) => {
                addLine(e.target.value);
                setPicker("");
              }}
              className="lunia-input min-h-11"
            >
              <option value="">Choose a product…</option>
              {pickable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameEn}
                  {p.sku ? ` (${p.sku})` : ""} · {p.stockQty} {p.unit} in stock
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={suggest} disabled={isPending} className="lunia-btn lunia-btn-forest-outline min-h-11 disabled:opacity-60">
            Suggest reorder
          </button>
        </div>
        {info && <p className="text-sm text-[var(--color-teal-ink)]">{info}</p>}

        {lines.length === 0 ? (
          <p className="rounded border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/60">
            No lines yet. Add products or use Suggest reorder.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--line)]">
            {parsed.map((l) => {
              const p = byId.get(l.productId);
              const lineTotal = Number.isInteger(l.qtyN) && l.costMinor !== null ? l.qtyN * l.costMinor : null;
              return (
                <li key={l.key} className="flex flex-wrap items-end gap-3 py-3">
                  <div className="min-w-[12rem] flex-1">
                    <div className="text-sm font-medium">{p?.nameEn ?? "Unknown product"}</div>
                    {p && (
                      <div className="text-xs text-[var(--color-ink)]/55">
                        {p.stockQty} {p.unit} in stock{p.reorderLevel ? ` · reorder at ${p.reorderLevel}` : ""}
                      </div>
                    )}
                  </div>
                  <label className="flex w-24 flex-col gap-1">
                    <span className={labelText}>Qty</span>
                    <input type="number" min={1} step={1} value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} className="lunia-input min-h-11 text-right tabular-nums" />
                  </label>
                  <label className="flex w-32 flex-col gap-1">
                    <span className={labelText}>Unit cost</span>
                    <input inputMode="decimal" value={l.cost} onChange={(e) => updateLine(l.key, { cost: e.target.value })} className="lunia-input min-h-11 text-right tabular-nums" />
                  </label>
                  <div className="w-28 pb-3 text-right text-sm tabular-nums">{lineTotal !== null ? formatSarMinor(lineTotal) : "—"}</div>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                    className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11"
                    aria-label={`Remove ${p?.nameEn ?? "line"}`}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-end gap-6 border-t border-[var(--line)] pt-3 text-sm">
          <span className="text-[var(--color-ink)]/60">Total excl. VAT</span>
          <span className="font-semibold tabular-nums">{formatSarMinor(total)}</span>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={isPending} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60">
          {isPending ? "Saving…" : poId ? "Save draft" : "Create draft"}
        </button>
      </div>
    </form>
  );
}
