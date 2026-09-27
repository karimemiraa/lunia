"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { findProductByCodeAction } from "../actions";

// "Scan to find": a USB/Bluetooth barcode scanner behaves like a keyboard --
// it types the code and presses Enter -- so a plain input + submit is enough.
// A match opens the product; no match offers to create one with that barcode.
export function ScanBox() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState("");
  const [missing, setMissing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = code.trim();
    if (!value) return;
    setMissing(null);
    setError(null);
    startTransition(async () => {
      const result = await findProductByCodeAction(value);
      if (!result.ok) {
        setError(result.error);
      } else if (result.data) {
        router.push(`/admin/inventory/products/${result.data.id}`);
      } else {
        setMissing(value);
        setCode("");
        inputRef.current?.focus();
      }
    });
  }

  return (
    <form onSubmit={submit} className="lunia-card flex flex-col gap-2 p-4" role="search" aria-label="Scan to find a product">
      <label htmlFor="inventory-scan" className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
        Scan to find
      </label>
      <div className="flex gap-2">
        <input
          id="inventory-scan"
          ref={inputRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Scan a barcode or type a SKU, then Enter"
          autoComplete="off"
          inputMode="text"
          className="lunia-input min-h-11"
        />
        <button type="submit" disabled={isPending} className="lunia-btn lunia-btn-ghost min-h-11 disabled:opacity-60">
          {isPending ? "Finding…" : "Find"}
        </button>
      </div>
      {missing && (
        <p className="text-sm text-[var(--color-ink)]/70">
          No product with code <span className="font-mono">{missing}</span>.{" "}
          <Link href={`/admin/inventory/products/new?barcode=${encodeURIComponent(missing)}`} className="font-medium text-[var(--color-teal-ink)] underline">
            Create one with this barcode
          </Link>
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
