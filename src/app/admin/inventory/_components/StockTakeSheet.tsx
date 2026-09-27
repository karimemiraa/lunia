"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postStockTakeAction, previewStockTakeAction } from "../actions";
import { formatSarMinor } from "@/modules/inventory/money";
import type { StockTakeVariance } from "@/modules/inventory/ledger";
import { labelClass, labelText } from "./ui";

export interface StockTakeProduct {
  id: string;
  nameEn: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  unit: string;
  stockQty: number;
}

const DRAFT_KEY = "lunia:inventory:stocktake-draft";

// Count sheet: filter/scan to a product, type the counted quantity, preview
// the variances, then post them all as adjustments in one transaction. The
// in-progress count is kept in localStorage so a reload doesn't lose it.
export function StockTakeSheet({ products }: { products: StockTakeProduct[] }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [onlyCounted, setOnlyCounted] = useState(false);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<StockTakeVariance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputs = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from browser storage after hydration
      if (saved) setCounts(JSON.parse(saved));
    } catch {
      // Storage unavailable; start with an empty sheet.
    }
  }, []);

  function updateCount(id: string, value: string) {
    setPreview(null);
    setCounts((prev) => {
      const next = { ...prev, [id]: value };
      if (value === "") delete next[id];
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      } catch {
        // Ignore: the draft is a convenience only.
      }
      return next;
    });
  }

  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter((c): c is string => !!c))].sort(), [products]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!category || p.category === category) &&
        (!onlyCounted || counts[p.id] !== undefined) &&
        (!needle || [p.nameEn, p.sku, p.barcode].some((s) => s?.toLowerCase().includes(needle))),
    );
  }, [products, q, category, onlyCounted, counts]);

  const entries = Object.entries(counts)
    .map(([productId, value]) => ({ productId, countedQty: Number(value) }))
    .filter((e) => Number.isInteger(e.countedQty) && e.countedQty >= 0);

  // Scanner jumps straight to the product's count field.
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const code = q.trim();
    const match = products.find((p) => p.barcode === code || p.sku?.toLowerCase() === code.toLowerCase());
    if (match) {
      setQ("");
      setCategory("");
      setOnlyCounted(false);
      requestAnimationFrame(() => {
        const el = inputs.current.get(match.id);
        el?.scrollIntoView({ block: "center" });
        el?.focus();
      });
    }
  }

  function runPreview() {
    setError(null);
    setPosted(null);
    if (entries.length === 0) return setError("Enter at least one counted quantity.");
    startTransition(async () => {
      const result = await previewStockTakeAction({ counts: entries });
      if (!result.ok) return setError(result.error);
      setPreview(result.data!);
    });
  }

  function post() {
    if (!preview) return;
    const changes = preview.filter((v) => v.variance !== 0).length;
    if (!confirm(`Post ${changes} adjustment(s) from this count? This updates stock immediately.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await postStockTakeAction({ counts: entries, note: note.trim() || undefined });
      if (!result.ok) return setError(result.error);
      const d = result.data!;
      setPosted(`Posted: ${d.counted} counted, ${d.adjusted} adjusted, net ${formatSarMinor(d.netValueMinor)} at cost.`);
      setPreview(null);
      setCounts({});
      setNote("");
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Ignore.
      }
      router.refresh();
    });
  }

  const shown = preview ?? [];
  const netValue = shown.reduce((s, v) => s + v.varianceValueMinor, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="lunia-card grid gap-3 p-4 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
        <label className={labelClass}>
          <span className={labelText}>Find or scan</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onSearchKey}
            placeholder="Name, SKU, or scan a barcode"
            autoComplete="off"
            className="lunia-input min-h-11"
          />
        </label>
        <label className={labelClass}>
          <span className={labelText}>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="lunia-input min-h-11">
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyCounted} onChange={(e) => setOnlyCounted(e.target.checked)} className="h-5 w-5 accent-[var(--color-teal-ink)]" />
          Counted only
        </label>
      </div>

      <div className="lunia-card divide-y divide-[var(--line)]">
        {visible.length === 0 && <p className="px-4 py-8 text-center text-sm text-[var(--color-ink)]/60">No products match.</p>}
        {visible.map((p) => {
          const value = counts[p.id] ?? "";
          const n = Number(value);
          const variance = value !== "" && Number.isInteger(n) ? n - p.stockQty : null;
          return (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.nameEn}</div>
                <div className="text-xs text-[var(--color-ink)]/55">{[p.sku, p.category].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <div className="w-24 text-right text-sm tabular-nums text-[var(--color-ink)]/70">
                <span className="block text-[0.6rem] uppercase tracking-[0.12em] text-[var(--color-ink)]/45">System</span>
                {p.stockQty} {p.unit}
              </div>
              <label className="w-28">
                <span className="sr-only">Counted quantity for {p.nameEn}</span>
                <input
                  ref={(el) => {
                    if (el) inputs.current.set(p.id, el);
                    else inputs.current.delete(p.id);
                  }}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={value}
                  placeholder="Count"
                  onChange={(e) => updateCount(p.id, e.target.value)}
                  className="lunia-input min-h-11 text-right tabular-nums"
                />
              </label>
              <div className={`w-16 text-right text-sm font-medium tabular-nums ${variance ? (variance < 0 ? "text-red-700" : "text-[var(--color-teal-ink)]") : "text-[var(--color-ink)]/40"}`}>
                {variance === null ? "" : `${variance > 0 ? "+" : ""}${variance}`}
              </div>
            </div>
          );
        })}
      </div>

      <div className="lunia-card flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className={`${labelClass} min-w-[16rem] flex-1`}>
            <span className={labelText}>Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Monthly count, treatment room 2" className="lunia-input min-h-11" />
          </label>
          <button type="button" onClick={runPreview} disabled={isPending} className="lunia-btn lunia-btn-forest-outline min-h-11 disabled:opacity-60">
            Preview variances ({entries.length})
          </button>
          <button type="button" onClick={post} disabled={isPending || !preview} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-50">
            {isPending ? "Working…" : "Post stock-take"}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        {posted && <p className="text-sm font-medium text-[var(--color-teal-ink)]">{posted}</p>}
        {preview && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.1em] text-[var(--color-ink)]/55">
                  <th className="py-2 pe-3">Product</th>
                  <th className="py-2 pe-3 text-right">System</th>
                  <th className="py-2 pe-3 text-right">Counted</th>
                  <th className="py-2 pe-3 text-right">Variance</th>
                  <th className="py-2 text-right">Value at cost</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => (
                  <tr key={v.productId} className="border-t border-[var(--line)]">
                    <td className="py-2 pe-3">{v.nameEn}</td>
                    <td className="py-2 pe-3 text-right tabular-nums">{v.systemQty}</td>
                    <td className="py-2 pe-3 text-right tabular-nums">{v.countedQty}</td>
                    <td className={`py-2 pe-3 text-right font-medium tabular-nums ${v.variance < 0 ? "text-red-700" : v.variance > 0 ? "text-[var(--color-teal-ink)]" : ""}`}>
                      {v.variance > 0 ? "+" : ""}
                      {v.variance} {v.unit}
                    </td>
                    <td className="py-2 text-right tabular-nums">{formatSarMinor(v.varianceValueMinor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--line-strong)] font-semibold">
                  <td className="py-2" colSpan={4}>
                    Net variance ({shown.filter((v) => v.variance !== 0).length} to adjust)
                  </td>
                  <td className={`py-2 text-right tabular-nums ${netValue < 0 ? "text-red-700" : ""}`}>{formatSarMinor(netValue)}</td>
                </tr>
              </tfoot>
            </table>
            <p className="mt-2 text-xs text-[var(--color-ink)]/55">
              Variances are recalculated at the moment you post, so anything used or sold in between is accounted for.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
