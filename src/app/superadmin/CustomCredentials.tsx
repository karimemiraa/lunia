"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCustomCredentialAction, deleteCustomCredentialAction, type PlatformActionState } from "./actions";
import type { CustomCredential } from "@/modules/platform/secrets";

const initialState: PlatformActionState = {};

// Freeform API credentials the superadmin can add (name + value) and delete.
// Values are always masked once stored.
export function CustomCredentials({ credentials }: { credentials: CustomCredential[] }) {
  const [state, action, pending] = useActionState(addCustomCredentialAction, initialState);
  const router = useRouter();
  const [deleting, startDelete] = useTransition();

  function onDelete(name: string) {
    if (!window.confirm(`Delete API credential "${name}"?`)) return;
    startDelete(async () => {
      await deleteCustomCredentialAction(name);
      router.refresh();
    });
  }

  return (
    <div className="lunia-card flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">API credentials</h2>
        <p className="text-sm text-[var(--color-ink)]/60">Store any other API keys or tokens your integrations need.</p>
      </div>

      {credentials.length > 0 && (
        <ul className="flex flex-col gap-2">
          {credentials.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/40 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm text-[var(--color-ink)]">{c.name}</span>
                <span className="block truncate font-mono text-xs text-[var(--color-ink)]/50">{c.hint}</span>
              </span>
              <button
                type="button"
                onClick={() => onDelete(c.name)}
                disabled={deleting}
                className="lunia-btn lunia-btn-danger lunia-btn-sm shrink-0 disabled:opacity-60"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Name</span>
          <input type="text" name="name" placeholder="GOOGLE_MAPS_API_KEY" className="lunia-input" autoComplete="off" />
        </label>
        <label className="flex flex-1 flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Value</span>
          <input type="password" name="value" className="lunia-input" autoComplete="off" />
        </label>
        <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest shrink-0 disabled:opacity-60">
          {pending ? "Adding…" : "Add"}
        </button>
      </form>
      {state.error && <span role="alert" className="text-xs text-red-600">{state.error}</span>}
      {state.success && <span className="text-xs font-medium text-[var(--color-teal-ink,#2f6d67)]">Saved ✓</span>}
    </div>
  );
}
