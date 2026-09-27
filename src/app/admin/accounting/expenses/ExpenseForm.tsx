"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { PaymentMethod } from "@prisma/client";
import { saveExpenseAction, type ExpenseFormState } from "./actions";

export interface ExpenseFormValues {
  id?: string;
  paidDate: string;
  categoryId: string;
  vendor: string;
  description: string;
  amount: string;
  vat: string;
  method: PaymentMethod;
  reference: string;
  hasReceipt: boolean;
}

interface ExpenseFormProps {
  initial: ExpenseFormValues;
  categories: { id: string; name: string }[];
  methods: { value: PaymentMethod; label: string }[];
  receiptAccept: string;
}

const label = "text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60";

/** "1,250.5" -> 125050 halalas, or null. Mirrors parseSarToMinor for live previews. */
function toMinor(value: string): number | null {
  const cleaned = value.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

const fmt = (minor: number) => (minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ExpenseForm({ initial, categories, methods, receiptAccept }: ExpenseFormProps) {
  const [state, action, pending] = useActionState<ExpenseFormState | null, FormData>(saveExpenseAction, null);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [amount, setAmount] = useState(initial.amount);
  const [vat, setVat] = useState(initial.vat);

  const amountMinor = toMinor(amount);
  const vatMinor = vat.trim() === "" ? 0 : toMinor(vat);
  const total = amountMinor !== null && vatMinor !== null ? amountMinor + vatMinor : null;

  return (
    <form action={action} className="lunia-card flex flex-col gap-5 p-5 sm:p-6" data-testid="expense-form">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className={label}>Date paid</span>
          <input type="date" name="paidDate" required defaultValue={initial.paidDate} className="lunia-input min-h-11" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className={label}>Category</span>
          <select name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="lunia-input min-h-11">
            <option value="">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__new">New category…</option>
          </select>
        </label>
        {categoryId === "__new" && (
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className={label}>New category name</span>
            <input name="newCategory" required maxLength={80} className="lunia-input min-h-11" autoFocus />
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm">
          <span className={label}>Vendor</span>
          <input name="vendor" defaultValue={initial.vendor} maxLength={160} placeholder="e.g. Saudi Electricity Co." className="lunia-input min-h-11" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className={label}>Reference</span>
          <input name="reference" defaultValue={initial.reference} maxLength={120} placeholder="Invoice or transfer number" className="lunia-input min-h-11" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
          <span className={label}>Description</span>
          <input name="description" required defaultValue={initial.description} maxLength={500} className="lunia-input min-h-11" />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className={label}>Amount excl. VAT (SAR)</span>
          <input
            name="amount"
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="lunia-input min-h-11 tabular-nums"
          />
        </label>
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="expense-vat" className={label}>
            Input VAT (SAR)
          </label>
          <input
            id="expense-vat"
            name="vat"
            inputMode="decimal"
            value={vat}
            onChange={(e) => setVat(e.target.value)}
            placeholder="0.00"
            className="lunia-input min-h-11 tabular-nums"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11"
              disabled={amountMinor === null}
              onClick={() => amountMinor !== null && setVat((Math.round((amountMinor * 15) / 100) / 100).toFixed(2))}
            >
              15%
            </button>
            <button type="button" className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11" onClick={() => setVat("0")}>
              No VAT
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          <span className={label}>Total paid</span>
          <p className="min-h-11 py-2.5 text-lg font-medium tabular-nums text-[var(--color-ink)]" aria-live="polite">
            {total === null ? "-" : `${fmt(total)} SAR`}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className={label}>Paid by</span>
          <select name="method" defaultValue={initial.method} className="lunia-input min-h-11">
            {methods.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-col gap-1.5 text-sm">
          <label htmlFor="expense-receipt" className={label}>
            {initial.hasReceipt ? "Replace receipt" : "Receipt (optional)"}
          </label>
          <input id="expense-receipt" type="file" name="receipt" accept={receiptAccept} className="min-h-11 py-2 text-sm" />
          {initial.hasReceipt && initial.id && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <a
                href={`/admin/accounting/expenses/${initial.id}/receipt`}
                target="_blank"
                rel="noopener"
                className="text-[var(--color-teal-ink)] underline-offset-2 hover:underline"
              >
                View current receipt
              </a>
              <label className="inline-flex min-h-11 items-center gap-2">
                <input type="checkbox" name="removeReceipt" className="h-4 w-4" />
                Remove it
              </label>
            </div>
          )}
          <span className="text-xs text-[var(--color-ink)]/50">PDF or photo, up to 10MB. Stored privately.</span>
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="text-sm text-[#b42318]">
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60">
          {pending ? "Saving…" : initial.id ? "Save changes" : "Record expense"}
        </button>
        <Link href="/admin/accounting/expenses" className="lunia-btn lunia-btn-ghost min-h-11">
          Cancel
        </Link>
      </div>
    </form>
  );
}
