"use client";

import { useActionState } from "react";
import { saveSecretsAction, type PlatformActionState } from "./actions";
import type { SecretGroup, SecretStatus } from "@/modules/platform/secrets";

const initialState: PlatformActionState = {};

// One integration group (Email / WhatsApp / Payments / AI). Secret fields
// never prefill — they show a masked hint and "leave blank to keep". Non-secret
// fields (host/port/ids) prefill their stored value so they read as a form.
export function SecretsForm({ group, status }: { group: SecretGroup; status: Record<string, SecretStatus> }) {
  const [state, action, pending] = useActionState(saveSecretsAction, initialState);

  return (
    <form action={action} className="lunia-card flex flex-col gap-4 p-6" data-testid={`secret-group-${group.id}`}>
      <input type="hidden" name="group" value={group.id} />
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">{group.title}</h2>
        <p className="text-sm text-[var(--color-ink)]/60">{group.description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {group.fields.map((f) => {
          const st = status[f.key];
          const isSetSecret = f.secret && st?.isSet;
          return (
            <label key={f.key} className="flex flex-col gap-1.5 text-sm">
              <span className="flex items-center gap-2 font-medium text-[var(--color-ink)]">
                {f.label}
                {st?.isSet && (
                  <span className="rounded-full bg-[var(--color-teal)]/20 px-2 py-0.5 text-[0.6rem] uppercase tracking-wide text-[var(--color-teal-ink,#2f6d67)]">
                    Set
                  </span>
                )}
              </span>
              <input
                type={f.secret ? "password" : "text"}
                name={f.key}
                autoComplete="off"
                defaultValue={f.secret ? "" : st?.hint ?? ""}
                placeholder={isSetSecret ? `${st?.hint} — leave blank to keep` : f.placeholder ?? ""}
                className="lunia-input"
              />
              {f.help && <span className="text-xs text-[var(--color-ink)]/50">{f.help}</span>}
            </label>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest disabled:opacity-60">
          {pending ? "Saving…" : `Save ${group.title}`}
        </button>
        {state.success && <span className="text-xs font-medium text-[var(--color-teal-ink,#2f6d67)]">Saved ✓</span>}
        {state.error && <span role="alert" className="text-xs text-red-600">{state.error}</span>}
      </div>
    </form>
  );
}
