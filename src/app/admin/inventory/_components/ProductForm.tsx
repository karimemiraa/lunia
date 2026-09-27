"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProductAction, updateProductAction } from "../actions";
import { PRODUCT_KINDS, PRODUCT_UNITS, minorToSarInput, parseSarToMinor, formatSarMinor } from "@/modules/inventory/money";
import { labelClass, labelText } from "./ui";

export interface ProductFormValues {
  id?: string;
  sku: string;
  barcode: string;
  nameEn: string;
  nameAr: string;
  brandName: string;
  supplierId: string;
  category: string;
  unit: string;
  kind: string;
  costMinor: number;
  priceMinor: number;
  vatRateBp: number;
  reorderLevel: number;
  isActive: boolean;
}

interface Props {
  initial: ProductFormValues;
  suppliers: { id: string; name: string }[];
  categories: string[];
}

const KIND_LABELS: Record<string, string> = { RETAIL: "Retail (sold)", CONSUMABLE: "Consumable (used in treatments)", BOTH: "Both" };

export function ProductForm({ initial, suppliers, categories }: Props) {
  const router = useRouter();
  const isNew = !initial.id;
  const [v, setV] = useState({
    ...initial,
    cost: minorToSarInput(initial.costMinor),
    price: minorToSarInput(initial.priceMinor),
    vat: String(initial.vatRateBp / 100),
    reorder: String(initial.reorderLevel),
    opening: "0",
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const set = (key: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSaved(false);
    setV((prev) => ({ ...prev, [key]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  };

  const priceMinor = parseSarToMinor(v.price);
  const vatBp = Math.round(Number(v.vat) * 100);
  const priceInclVat = priceMinor !== null && Number.isFinite(vatBp) ? Math.round(priceMinor * (1 + vatBp / 10_000)) : null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const costMinor = parseSarToMinor(v.cost);
    if (costMinor === null || priceMinor === null) return setError("Enter cost and price as amounts in SAR, e.g. 45.50");
    if (!Number.isFinite(vatBp) || vatBp < 0 || vatBp > 10_000) return setError("VAT rate must be between 0 and 100%.");
    const reorderLevel = Number(v.reorder);
    if (!Number.isInteger(reorderLevel) || reorderLevel < 0) return setError("Reorder level must be a whole number.");
    const payload = {
      sku: v.sku,
      barcode: v.barcode,
      nameEn: v.nameEn,
      nameAr: v.nameAr,
      brandName: v.brandName,
      supplierId: v.supplierId,
      category: v.category,
      unit: v.unit as (typeof PRODUCT_UNITS)[number],
      kind: v.kind as (typeof PRODUCT_KINDS)[number],
      costMinor,
      priceMinor,
      vatRateBp: vatBp,
      reorderLevel,
      isActive: v.isActive,
    };
    startTransition(async () => {
      if (isNew) {
        const openingQty = Number(v.opening || 0);
        if (!Number.isInteger(openingQty) || openingQty < 0) return setError("Opening stock must be a whole number.");
        const result = await createProductAction({ ...payload, openingQty });
        if (!result.ok) return setError(result.error);
        router.push(`/admin/inventory/products/${result.data!.id}`);
      } else {
        const result = await updateProductAction(initial.id!, payload);
        if (!result.ok) return setError(result.error);
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="lunia-card flex flex-col gap-5 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={labelText}>Name (English)</span>
          <input required value={v.nameEn} onChange={set("nameEn")} className="lunia-input min-h-11" />
        </label>
        <label className={labelClass}>
          <span className={labelText}>Name (Arabic)</span>
          <input dir="rtl" lang="ar" value={v.nameAr} onChange={set("nameAr")} className="lunia-input min-h-11" />
        </label>
        <label className={labelClass}>
          <span className={labelText}>Barcode</span>
          <input
            value={v.barcode}
            onChange={set("barcode")}
            // A scanner ends with Enter; keep that from submitting the form.
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
            placeholder="Click here and scan"
            autoComplete="off"
            className="lunia-input min-h-11 font-mono"
          />
        </label>
        <label className={labelClass}>
          <span className={labelText}>SKU</span>
          <input value={v.sku} onChange={set("sku")} autoComplete="off" className="lunia-input min-h-11 font-mono" />
        </label>
        <label className={labelClass}>
          <span className={labelText}>Brand</span>
          <input value={v.brandName} onChange={set("brandName")} className="lunia-input min-h-11" />
        </label>
        <label className={labelClass}>
          <span className={labelText}>Category</span>
          <input value={v.category} onChange={set("category")} list="inventory-categories" className="lunia-input min-h-11" />
          <datalist id="inventory-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className={labelClass}>
          <span className={labelText}>Supplier</span>
          <select value={v.supplierId} onChange={set("supplierId")} className="lunia-input min-h-11">
            <option value="">None</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className={labelClass}>
            <span className={labelText}>Type</span>
            <select value={v.kind} onChange={set("kind")} className="lunia-input min-h-11">
              {PRODUCT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className={labelText}>Unit</span>
            <select value={v.unit} onChange={set("unit")} className="lunia-input min-h-11">
              {PRODUCT_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-4 border-t border-[var(--line)] pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <label className={labelClass}>
          <span className={labelText}>Cost per unit (SAR)</span>
          <input inputMode="decimal" value={v.cost} onChange={set("cost")} className="lunia-input min-h-11 tabular-nums" />
          {!isNew && <span className="text-xs text-[var(--color-ink)]/50">Updated automatically as a weighted average when stock is received.</span>}
        </label>
        <label className={labelClass}>
          <span className={labelText}>Retail price excl. VAT (SAR)</span>
          <input inputMode="decimal" value={v.price} onChange={set("price")} className="lunia-input min-h-11 tabular-nums" />
          {priceInclVat !== null && <span className="text-xs text-[var(--color-ink)]/50">{formatSarMinor(priceInclVat)} incl. VAT</span>}
        </label>
        <label className={labelClass}>
          <span className={labelText}>VAT rate (%)</span>
          <input inputMode="decimal" value={v.vat} onChange={set("vat")} className="lunia-input min-h-11 tabular-nums" />
        </label>
        <label className={labelClass}>
          <span className={labelText}>Reorder level ({v.unit})</span>
          <input type="number" min={0} step={1} value={v.reorder} onChange={set("reorder")} className="lunia-input min-h-11 tabular-nums" />
        </label>
        {isNew && (
          <label className={labelClass}>
            <span className={labelText}>Opening stock ({v.unit})</span>
            <input type="number" min={0} step={1} value={v.opening} onChange={set("opening")} className="lunia-input min-h-11 tabular-nums" />
          </label>
        )}
      </div>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" checked={v.isActive} onChange={set("isActive")} className="h-5 w-5 accent-[var(--color-teal-ink)]" />
        Active (inactive products are hidden from pickers and reorder suggestions)
      </label>

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {saved && <p className="text-sm font-medium text-[var(--color-teal-ink)]">Saved.</p>}

      <div>
        <button type="submit" disabled={isPending} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60">
          {isPending ? "Saving…" : isNew ? "Create product" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
