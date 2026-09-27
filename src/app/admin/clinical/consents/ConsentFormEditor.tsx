"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveConsentFormAction } from "./actions";

export interface ConsentFormValues {
  key: string;
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  serviceIds: string[];
  isActive: boolean;
}

interface Props {
  id: string | null;
  version: number | null;
  initial: ConsentFormValues;
  services: { id: string; label: string; group: string }[];
}

const label = "text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/60";

export function ConsentFormEditor({ id, version, initial, services }: Props) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof ConsentFormValues>(k: K, value: ConsentFormValues[K]) => {
    setNotice(null);
    setV((prev) => ({ ...prev, [k]: value }));
  };
  const textChanged = ["titleEn", "titleAr", "bodyEn", "bodyAr"].some((k) => v[k as keyof ConsentFormValues] !== initial[k as keyof ConsentFormValues]);
  const groups = [...new Set(services.map((s) => s.group))];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveConsentFormAction(id, v);
      if (!result.ok) return setError(result.error);
      if (!id) {
        router.push(`/admin/clinical/consents/${result.id}?created=1`);
        return;
      }
      setNotice(`Saved. Current version: v${result.version}.`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" data-testid="consent-form-editor">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1.5">
          <span className={label}>Key</span>
          <input value={v.key} onChange={(e) => set("key", e.target.value)} placeholder="e.g. laser-consent" className="lunia-input min-h-11 font-mono" required maxLength={60} />
          <span className="text-xs text-[var(--color-ink)]/45">Stable identifier. &ldquo;general-treatment&rdquo; and &ldquo;photography&rdquo; also record the customer&rsquo;s consent dates.</span>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={v.isActive} onChange={(e) => set("isActive", e.target.checked)} className="h-5 w-5 accent-[var(--color-teal)]" />
          Active (offered for signing)
        </label>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className={label}>Title (English)</span>
            <input value={v.titleEn} onChange={(e) => set("titleEn", e.target.value)} className="lunia-input min-h-11" required maxLength={200} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Text (English)</span>
            <textarea value={v.bodyEn} onChange={(e) => set("bodyEn", e.target.value)} rows={16} className="lunia-input leading-relaxed" required />
          </label>
        </div>
        <div className="flex flex-col gap-3" dir="rtl" lang="ar">
          <label className="flex flex-col gap-1.5">
            <span className={label}>العنوان (عربي)</span>
            <input value={v.titleAr} onChange={(e) => set("titleAr", e.target.value)} className="lunia-input min-h-11" required maxLength={200} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>النص (عربي)</span>
            <textarea value={v.bodyAr} onChange={(e) => set("bodyAr", e.target.value)} rows={16} className="lunia-input leading-relaxed" required />
          </label>
        </div>
      </div>
      <p className="text-xs text-[var(--color-ink)]/50">Separate paragraphs with a blank line.</p>

      <fieldset className="flex flex-col gap-3">
        <legend className={`${label} mb-1`}>Required for these services</legend>
        <p className="text-xs text-[var(--color-ink)]/50">
          Customers with an upcoming booking for any selected service are asked to sign it. Leave all unticked for a form that isn&rsquo;t tied to a service (it shows as optional, or always required for the general treatment consent).
        </p>
        {groups.map((g) => (
          <div key={g} className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-[var(--color-ink)]/60">{g}</p>
            <div className="flex flex-wrap gap-2">
              {services
                .filter((s) => s.group === g)
                .map((s) => {
                  const on = v.serviceIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm ${
                        on ? "border-[var(--color-teal)] bg-[var(--color-teal)]/15" : "border-[var(--line-strong)] text-[var(--color-ink)]/70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        onChange={() => set("serviceIds", on ? v.serviceIds.filter((x) => x !== s.id) : [...v.serviceIds, s.id])}
                      />
                      {s.label}
                    </label>
                  );
                })}
            </div>
          </div>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest min-h-11 disabled:opacity-60">
          {pending ? "Saving…" : id ? "Save" : "Create form"}
        </button>
        {id && version !== null && (
          <span className="text-xs text-[var(--color-ink)]/55">
            {textChanged ? `Saving will publish v${version + 1}; customers who signed v${version} will be asked to sign again.` : `Current version v${version}.`}
          </span>
        )}
        {notice && <span role="status" className="text-sm text-[var(--color-teal-ink)]">{notice}</span>}
        {error && <span role="alert" className="text-sm text-red-700">{error}</span>}
      </div>
    </form>
  );
}
