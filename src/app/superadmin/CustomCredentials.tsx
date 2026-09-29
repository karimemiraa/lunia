"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCustomCredentialAction, deleteCustomCredentialAction, type PlatformActionState } from "./actions";
import type { CustomCredential } from "@/modules/platform/secrets";
import { Field } from "@/app/admin/_ui/Field";
import { SecretInput } from "@/app/admin/_ui/SecretInput";
import { Form, InlineStatus, SubmitButton } from "@/app/admin/_ui/Form";
import { ConfirmButton } from "@/app/admin/_ui/ConfirmDialog";

const initialState: PlatformActionState = {};

// Freeform API credentials the superadmin can add (name + value) and delete.
// Values are always masked once stored.
export function CustomCredentials({ credentials }: { credentials: CustomCredential[] }) {
  const [state, action, pending] = useActionState(addCustomCredentialAction, initialState);
  const router = useRouter();
  const [deleting, startDelete] = useTransition();

  function onDelete(name: string) {
    startDelete(async () => {
      await deleteCustomCredentialAction(name);
      router.refresh();
    });
  }

  return (
    <div className="lunia-card flex flex-col gap-5 p-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">API credentials</h2>
        <p className="text-sm text-[var(--color-ink)]/60">Store any other API keys or tokens your integrations need.</p>
      </div>

      {credentials.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {credentials.map((c) => (
            <li key={c.name} className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)]/40 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-mono text-sm text-[var(--color-ink)]">{c.name}</span>
                <span className="block truncate font-mono text-xs text-[var(--color-ink)]/50">{c.hint}</span>
              </span>
              <ConfirmButton title={`Delete “${c.name}”?`} description="Integrations that read this credential will stop working until it is added again." confirmLabel="Delete credential" onConfirm={() => onDelete(c.name)} pending={deleting}>
                Delete
              </ConfirmButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--color-ink)]/55">No custom credentials yet.</p>
      )}

      <Form action={action} className="flex flex-col gap-3 border-t border-[var(--line)] pt-4 sm:flex-row sm:items-start">
        <Field label="Name" name="name" required placeholder="GOOGLE_MAPS_API_KEY" autoComplete="off" pattern="[A-Za-z0-9_.-]+" help="Letters, numbers, underscores." className="flex-1" inputClassName="font-mono uppercase" />
        <div className="flex-1">
          <SecretInput label="Value" name="value" required />
        </div>
        <div className="pt-6">
          <SubmitButton pending={pending} pendingLabel="Adding…">
            Add
          </SubmitButton>
        </div>
      </Form>
      <InlineStatus success={state.success ? "Saved." : undefined} error={state.error} />
    </div>
  );
}
