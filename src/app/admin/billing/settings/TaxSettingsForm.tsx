"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TaxSettings } from "@/modules/billing/settings";
import { saveTaxSettingsAction } from "../actions";

const TEXT_FIELDS: { key: keyof TaxSettings; label: string; hint?: string; dir?: "rtl"; mono?: boolean }[] = [
  { key: "sellerNameAr", label: "Legal name (Arabic)", dir: "rtl" },
  { key: "sellerNameEn", label: "Legal name (English)" },
  { key: "vatNumber", label: "VAT registration number", hint: "15 digits, starts and ends with 3", mono: true },
  { key: "crNumber", label: "Commercial registration (CR) no.", mono: true },
  { key: "buildingNo", label: "Building number", hint: "4 digits", mono: true },
  { key: "street", label: "Street" },
  { key: "district", label: "District" },
  { key: "city", label: "City" },
  { key: "postalCode", label: "Postal code", hint: "5 digits", mono: true },
  { key: "additionalNo", label: "Additional number (optional)", mono: true },
  { key: "invoicePrefix", label: "Invoice number prefix", hint: "e.g. INV → INV-2026-000001", mono: true },
  { key: "creditNotePrefix", label: "Credit note prefix", hint: "e.g. CN → CN-2026-000001", mono: true },
];

export function TaxSettingsForm({ initial, canEdit }: { initial: TaxSettings; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function save(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await saveTaxSettingsAction(value);
      setMessage(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={save} className="lunia-card flex flex-col gap-5 p-5">
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
        {TEXT_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">
            {f.label}
            <input
              dir={f.dir}
              value={String(value[f.key] ?? "")}
              onChange={(e) => setValue((v) => ({ ...v, [f.key]: f.key.endsWith("Prefix") ? e.target.value.toUpperCase() : e.target.value }))}
              className={`lunia-input min-h-[44px] normal-case tracking-normal ${f.mono ? "font-mono" : ""}`}
            />
            {f.hint && <span className="normal-case tracking-normal text-[var(--color-ink)]/45">{f.hint}</span>}
          </label>
        ))}
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/55">
          Default VAT rate (%)
          <input
            inputMode="decimal"
            value={value.defaultVatRateBp / 100}
            onChange={(e) => setValue((v) => ({ ...v, defaultVatRateBp: Math.round(Number(e.target.value || 0) * 100) }))}
            className="lunia-input min-h-[44px] normal-case tracking-normal"
          />
        </label>
      </fieldset>

      <fieldset disabled={!canEdit} className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Catalog prices</legend>
        {[
          { v: true, title: "Prices include VAT (recommended)", body: "Service and package prices shown on the website are what the customer pays. Invoices work out the VAT inside them — a 500 SAR service prints as 434.78 + 65.22 VAT." },
          { v: false, title: "Prices exclude VAT", body: "VAT is added on top of catalog prices at the till — a 500 SAR service is invoiced as 575 SAR." },
        ].map((o) => (
          <label key={String(o.v)} className="flex min-h-[44px] cursor-pointer items-start gap-3 text-sm">
            <input type="radio" name="pricesIncludeVat" checked={value.pricesIncludeVat === o.v} onChange={() => setValue((v) => ({ ...v, pricesIncludeVat: o.v }))} className="mt-1 h-5 w-5" />
            <span>
              <span className="font-medium">{o.title}</span>
              <span className="block text-[var(--color-ink)]/60">{o.body}</span>
            </span>
          </label>
        ))}
        <p className="text-xs text-[var(--color-ink)]/50">Product prices in inventory are always stored excluding VAT.</p>
      </fieldset>

      {message && (
        <p role="status" className={`text-sm ${message.ok ? "text-[var(--color-teal-ink)]" : "text-red-700"}`}>
          {message.text}
        </p>
      )}
      {canEdit ? (
        <div className="flex justify-end">
          <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest min-h-[44px] disabled:opacity-50">
            {pending ? "Saving…" : "Save settings"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-[var(--color-ink)]/55">Only owners, admins or finance (settings or accounting access) can change these details.</p>
      )}
    </form>
  );
}
