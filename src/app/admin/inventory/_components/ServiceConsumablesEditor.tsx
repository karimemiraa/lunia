"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setServiceConsumablesAction } from "../actions";

interface Props {
  serviceId: string;
  products: { id: string; nameEn: string; unit: string }[];
  initial: { productId: string; qty: number }[];
}

export function ServiceConsumablesEditor({ serviceId, products, initial }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial.map((i) => ({ productId: i.productId, qty: String(i.qty) })));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const byId = new Map(products.map((p) => [p.id, p]));
  const used = new Set(items.map((i) => i.productId));

  function save() {
    setError(null);
    setSaved(false);
    const parsed = items.map((i) => ({ productId: i.productId, qty: Number(i.qty) }));
    if (parsed.some((i) => !Number.isInteger(i.qty) || i.qty < 1)) return setError("Quantities must be whole numbers of at least 1.");
    startTransition(async () => {
      const result = await setServiceConsumablesAction({ serviceId, items: parsed });
      if (!result.ok) return setError(result.error);
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 && <p className="text-sm text-[var(--color-ink)]/55">No consumables linked to this service.</p>}
      {items.map((item, idx) => {
        const p = byId.get(item.productId);
        return (
          <div key={item.productId} className="flex flex-wrap items-center gap-3">
            <span className="min-w-[12rem] flex-1 text-sm">{p?.nameEn ?? "Unknown product"}</span>
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Quantity of {p?.nameEn}</span>
              <input
                type="number"
                min={1}
                step={1}
                value={item.qty}
                onChange={(e) => {
                  setSaved(false);
                  setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)));
                }}
                className="lunia-input min-h-11 w-24 text-right tabular-nums"
              />
              <span className="w-8 text-[var(--color-ink)]/60">{p?.unit}</span>
            </label>
            <button
              type="button"
              onClick={() => {
                setSaved(false);
                setItems((prev) => prev.filter((_, i) => i !== idx));
              }}
              className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11"
            >
              Remove
            </button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            setSaved(false);
            setItems((prev) => [...prev, { productId: e.target.value, qty: "1" }]);
          }}
          aria-label="Add a consumable"
          className="lunia-input min-h-11 max-w-sm"
        >
          <option value="">Add a consumable…</option>
          {products
            .filter((p) => !used.has(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nameEn} ({p.unit})
              </option>
            ))}
        </select>
        <button type="button" onClick={save} disabled={isPending} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60">
          {isPending ? "Saving…" : "Save consumables"}
        </button>
        {saved && <span className="text-sm font-medium text-[var(--color-teal-ink)]">Saved.</span>}
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
