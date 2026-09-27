"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelPurchaseOrderAction, markOrderedAction, receivePurchaseOrderAction } from "../actions";
import { labelText } from "./ui";

export interface ReceiveLine {
  id: string;
  productName: string;
  unit: string;
  qty: number;
  receivedQty: number;
}

// Receive goods against an ORDERED/PARTIAL purchase order: per line, the qty
// that arrived (defaults to everything outstanding) plus optional lot/expiry.
export function PoReceiveForm({ poId, lines }: { poId: string; lines: ReceiveLine[] }) {
  const router = useRouter();
  const outstanding = lines.filter((l) => l.qty > l.receivedQty);
  const [rows, setRows] = useState(() =>
    Object.fromEntries(outstanding.map((l) => [l.id, { qty: String(l.qty - l.receivedQty), lot: "", expires: "" }])),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const update = (id: string, patch: Partial<{ qty: string; lot: string; expires: string }>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const payload = outstanding.map((l) => ({
      lineId: l.id,
      qty: Number(rows[l.id].qty || 0),
      lotNumber: rows[l.id].lot.trim() || undefined,
      expiresAt: rows[l.id].expires || undefined,
    }));
    const bad = payload.find((p, i) => !Number.isInteger(p.qty) || p.qty < 0 || p.qty > outstanding[i].qty - outstanding[i].receivedQty);
    if (bad) return setError("Received quantities must be whole numbers, no more than what's outstanding.");
    if (payload.every((p) => p.qty === 0)) return setError("Enter what arrived on at least one line.");
    startTransition(async () => {
      const result = await receivePurchaseOrderAction(poId, { lines: payload });
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  }

  if (outstanding.length === 0) return null;

  return (
    <form onSubmit={submit} className="lunia-card flex flex-col gap-4 p-5">
      <div>
        <h3 className="text-base font-semibold">Receive goods</h3>
        <p className="text-sm text-[var(--color-ink)]/60">
          Enter what actually arrived. Anything left outstanding keeps the order open as partially received. Lot and expiry are optional but
          power the expiring-soon alerts.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-[var(--line)]">
        {outstanding.map((l) => (
          <li key={l.id} className="flex flex-wrap items-end gap-3 py-3">
            <div className="min-w-[12rem] flex-1">
              <div className="text-sm font-medium">{l.productName}</div>
              <div className="text-xs text-[var(--color-ink)]/55">
                {l.qty - l.receivedQty} of {l.qty} {l.unit} outstanding
              </div>
            </div>
            <label className="flex w-24 flex-col gap-1">
              <span className={labelText}>Received</span>
              <input
                type="number"
                min={0}
                max={l.qty - l.receivedQty}
                step={1}
                value={rows[l.id].qty}
                onChange={(e) => update(l.id, { qty: e.target.value })}
                className="lunia-input min-h-11 text-right tabular-nums"
              />
            </label>
            <label className="flex w-36 flex-col gap-1">
              <span className={labelText}>Lot no.</span>
              <input value={rows[l.id].lot} onChange={(e) => update(l.id, { lot: e.target.value })} className="lunia-input min-h-11 font-mono" />
            </label>
            <label className="flex w-44 flex-col gap-1">
              <span className={labelText}>Expiry date</span>
              <input type="date" value={rows[l.id].expires} onChange={(e) => update(l.id, { expires: e.target.value })} className="lunia-input min-h-11" />
            </label>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={isPending} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60">
          {isPending ? "Receiving…" : "Receive into stock"}
        </button>
      </div>
    </form>
  );
}

export function PoStatusActions({ poId, status }: { poId: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: (id: string) => Promise<{ ok: boolean; error?: string }>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setError(null);
    startTransition(async () => {
      const result = await action(poId);
      if (!result.ok) return setError(result.error ?? "Something went wrong.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "DRAFT" && (
        <button type="button" disabled={isPending} onClick={() => run(markOrderedAction, "Mark this order as sent to the supplier? Lines can no longer be edited.")} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60">
          Mark as ordered
        </button>
      )}
      {["DRAFT", "ORDERED", "PARTIAL"].includes(status) && (
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            run(
              cancelPurchaseOrderAction,
              status === "PARTIAL" ? "Close this order? What has already been received stays in stock; nothing more is expected." : "Cancel this purchase order?",
            )
          }
          className="lunia-btn lunia-btn-danger min-h-11"
        >
          {status === "PARTIAL" ? "Close (cancel rest)" : "Cancel order"}
        </button>
      )}
      {error && (
        <p role="alert" className="w-full text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
