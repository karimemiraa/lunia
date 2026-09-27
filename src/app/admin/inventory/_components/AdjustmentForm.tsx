"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustStockAction } from "../actions";
import { labelClass, labelText } from "./ui";

const KINDS = [
  { value: "COUNT", label: "Count correction", help: "Enter what is physically on the shelf; the difference is posted." },
  { value: "WASTE", label: "Waste / expired / damaged", help: "Units written off. Add the lot number if you're writing off an expired lot." },
  { value: "RETURN", label: "Return to supplier", help: "Units sent back to the supplier." },
] as const;

export function AdjustmentForm({ productId, unit, stockQty }: { productId: string; unit: string; stockQty: number }) {
  const router = useRouter();
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("COUNT");
  const [qty, setQty] = useState("");
  const [lot, setLot] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const n = Number(qty);
  const preview = qty === "" || !Number.isInteger(n) ? null : kind === "COUNT" ? n - stockQty : -n;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(null);
    if (qty === "" || !Number.isInteger(n) || (kind !== "COUNT" && n <= 0)) return setError("Enter a whole-number quantity.");
    if (reason.trim().length < 3) return setError("A reason is required.");
    startTransition(async () => {
      const result = await adjustStockAction(
        kind === "COUNT"
          ? { kind, productId, countedQty: n, reason }
          : { kind, productId, qty: n, reason, lotNumber: lot.trim() || undefined },
      );
      if (!result.ok) return setError(result.error);
      setDone(preview === 0 ? "Count matches the system; nothing to post." : "Adjustment posted.");
      setQty("");
      setLot("");
      setReason("");
      router.refresh();
    });
  }

  const current = KINDS.find((k) => k.value === kind)!;

  return (
    <form onSubmit={submit} className="lunia-card flex flex-col gap-4 p-5">
      <h3 className="text-base font-semibold">Adjust stock</h3>
      <div role="radiogroup" aria-label="Adjustment type" className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            role="radio"
            aria-checked={kind === k.value}
            onClick={() => setKind(k.value)}
            className={`min-h-11 rounded-full px-4 text-sm transition-colors ${
              kind === k.value ? "bg-[var(--color-forest)] text-[var(--color-cream)]" : "border border-[var(--line-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-[var(--color-ink)]/60">{current.help}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={labelText}>{kind === "COUNT" ? `Counted quantity (${unit})` : `Quantity removed (${unit})`}</span>
          <input type="number" step={1} min={kind === "COUNT" ? undefined : 1} value={qty} onChange={(e) => setQty(e.target.value)} className="lunia-input min-h-11 tabular-nums" />
          {preview !== null && (
            <span className="text-xs text-[var(--color-ink)]/60">
              Change {preview > 0 ? "+" : ""}
              {preview} {unit}, new balance {stockQty + preview} {unit}
            </span>
          )}
        </label>
        {kind !== "COUNT" && (
          <label className={labelClass}>
            <span className={labelText}>Lot number (optional)</span>
            <input value={lot} onChange={(e) => setLot(e.target.value)} className="lunia-input min-h-11 font-mono" />
          </label>
        )}
        <label className={`${labelClass} sm:col-span-2`}>
          <span className={labelText}>Reason (required)</span>
          <input required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} className="lunia-input min-h-11" />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {done && <p className="text-sm font-medium text-[var(--color-teal-ink)]">{done}</p>}
      <div>
        <button type="submit" disabled={isPending} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60">
          {isPending ? "Posting…" : "Post adjustment"}
        </button>
      </div>
    </form>
  );
}
