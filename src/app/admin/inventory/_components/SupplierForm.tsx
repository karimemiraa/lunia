"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSupplierAction, deleteSupplierAction, updateSupplierAction } from "../actions";
import { labelClass, labelText } from "./ui";

export interface SupplierFormValues {
  id?: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  vatNumber: string;
  notes: string;
  isActive: boolean;
}

export const EMPTY_SUPPLIER: SupplierFormValues = { name: "", contactName: "", phone: "", email: "", vatNumber: "", notes: "", isActive: true };

export function SupplierForm({ initial, canDelete = false }: { initial: SupplierFormValues; canDelete?: boolean }) {
  const router = useRouter();
  const isNew = !initial.id;
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const set = (key: keyof SupplierFormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSaved(false);
    setV((prev) => ({ ...prev, [key]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  };

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const { id, ...payload } = v;
    startTransition(async () => {
      if (isNew) {
        const result = await createSupplierAction(payload);
        if (!result.ok) return setError(result.error);
        router.push(`/admin/inventory/suppliers/${result.data!.id}`);
      } else {
        const result = await updateSupplierAction(id!, payload);
        if (!result.ok) return setError(result.error);
        setSaved(true);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!initial.id || !confirm("Delete this supplier? Products linked to it will keep existing without a supplier.")) return;
    startTransition(async () => {
      const result = await deleteSupplierAction(initial.id!);
      if (!result.ok) return setError(result.error);
      router.push("/admin/inventory/suppliers");
    });
  }

  return (
    <form onSubmit={submit} className="lunia-card flex flex-col gap-4 p-5">
      <h3 className="text-base font-semibold">{isNew ? "Add a supplier" : "Supplier details"}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          <span className={labelText}>Company name</span>
          <input required value={v.name} onChange={set("name")} className="lunia-input min-h-11" />
        </label>
        <label className={labelClass}>
          <span className={labelText}>Contact person</span>
          <input value={v.contactName} onChange={set("contactName")} className="lunia-input min-h-11" />
        </label>
        <label className={labelClass}>
          <span className={labelText}>Phone</span>
          <input type="tel" value={v.phone} onChange={set("phone")} className="lunia-input min-h-11" />
        </label>
        <label className={labelClass}>
          <span className={labelText}>Email</span>
          <input type="email" value={v.email} onChange={set("email")} className="lunia-input min-h-11" />
        </label>
        <label className={labelClass}>
          <span className={labelText}>VAT number</span>
          <input value={v.vatNumber} onChange={set("vatNumber")} inputMode="numeric" placeholder="15 digits" className="lunia-input min-h-11 font-mono" />
        </label>
        <label className="flex min-h-11 items-center gap-3 self-end text-sm">
          <input type="checkbox" checked={v.isActive} onChange={set("isActive")} className="h-5 w-5 accent-[var(--color-teal-ink)]" />
          Active
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          <span className={labelText}>Notes</span>
          <textarea rows={3} value={v.notes} onChange={set("notes")} placeholder="Payment terms, delivery days, account number…" className="lunia-input" />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      {saved && <p className="text-sm font-medium text-[var(--color-teal-ink)]">Saved.</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={isPending} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60">
          {isPending ? "Saving…" : isNew ? "Add supplier" : "Save changes"}
        </button>
        {!isNew && canDelete && (
          <button type="button" onClick={remove} disabled={isPending} className="lunia-btn lunia-btn-danger min-h-11">
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
