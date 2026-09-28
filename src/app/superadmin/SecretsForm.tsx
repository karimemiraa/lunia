"use client";

import { useActionState } from "react";
import { saveSecretsAction, type PlatformActionState } from "./actions";
import type { SecretGroup, SecretStatus } from "@/modules/platform/secrets";
import { Field } from "@/app/admin/_ui/Field";
import { SecretInput } from "@/app/admin/_ui/SecretInput";
import { Form, InlineStatus, SubmitButton } from "@/app/admin/_ui/Form";
import { StatusPill } from "@/app/admin/_ui/StatusPill";

const initialState: PlatformActionState = {};

// One integration group (Email / WhatsApp / Payments / AI). Secret fields
// never prefill — they show a masked hint and "leave blank to keep". Non-secret
// fields (host/port/ids) prefill their stored value so they read as a form.
export function SecretsForm({ group, status }: { group: SecretGroup; status: Record<string, SecretStatus> }) {
  const [state, action, pending] = useActionState(saveSecretsAction, initialState);
  const total = group.fields.length;
  const set = group.fields.filter((f) => status[f.key]?.isSet).length;
  const configured = set === total ? "success" : set > 0 ? "warning" : "neutral";

  return (
    <Form action={action} className="lunia-card flex flex-col gap-5 p-6" data-testid={`secret-group-${group.id}`}>
      <input type="hidden" name="group" value={group.id} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">{group.title}</h2>
          <p className="max-w-xl text-sm text-[var(--color-ink)]/60">{group.description}</p>
        </div>
        <StatusPill tone={configured} dot>
          {set === total ? "Configured" : set > 0 ? `${set} of ${total} set` : "Not configured"}
        </StatusPill>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {group.fields.map((f) => {
          const st = status[f.key];
          return f.secret ? (
            <SecretInput key={f.key} label={f.label} name={f.key} hint={st?.hint} isSet={st?.isSet} help={f.help} placeholder={f.placeholder ?? ""} />
          ) : (
            <Field
              key={f.key}
              label={f.label}
              name={f.key}
              type={/port/i.test(f.key) ? "number" : /url/i.test(f.key) ? "url" : "text"}
              autoComplete="off"
              defaultValue={st?.hint ?? ""}
              placeholder={f.placeholder ?? ""}
              help={f.help}
              trailing={st?.isSet ? <StatusPill tone="success">Set</StatusPill> : undefined}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} pendingLabel="Saving…">
          Save {group.title}
        </SubmitButton>
        <InlineStatus success={state.success ? "Saved." : undefined} error={state.error} />
      </div>
    </Form>
  );
}
