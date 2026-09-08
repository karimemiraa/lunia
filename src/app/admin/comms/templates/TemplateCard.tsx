"use client";

import { useActionState } from "react";
import { updateTemplateAction, type TemplateActionState } from "./actions";
import type { MessageTemplate } from "@prisma/client";

const initialState: TemplateActionState = {};

const inputClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

interface TemplateCardProps {
  template: MessageTemplate;
  placeholders: string[];
}

// One card per (kind, locale, channel) MessageTemplate row. isActive is a
// plain checkbox whose defaultChecked mirrors the persisted value and whose
// presence/absence is always read explicitly in updateTemplateAction --
// never omitted -- so saving a deactivated template never silently
// reactivates it (see actions.ts).
export function TemplateCard({ template, placeholders }: TemplateCardProps) {
  const [state, action, pending] = useActionState(updateTemplateAction, initialState);
  const fieldPrefix = `${template.kind} ${template.locale} ${template.channel}`;

  return (
    <form
      action={action}
      data-testid={`template-${template.kind}-${template.locale}-${template.channel}`}
      className="flex flex-col gap-3 rounded border border-[var(--color-ink)]/10 p-4"
    >
      <input type="hidden" name="kind" value={template.kind} />
      <input type="hidden" name="locale" value={template.locale} />
      <input type="hidden" name="channel" value={template.channel} />

      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold text-[var(--color-ink)]">
          {template.kind} &middot; {template.locale.toUpperCase()} &middot; {template.channel}
        </h3>
        <label className="flex items-center gap-2 text-xs text-[var(--color-ink)]">
          <input type="checkbox" name="isActive" defaultChecked={template.isActive} aria-label={`${fieldPrefix} active`} />
          Active
        </label>
      </div>

      {placeholders.length > 0 && (
        <p className="text-xs text-[var(--color-ink)]/60">Placeholders: {placeholders.map((p) => `{{${p}}}`).join(", ")}</p>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">Body</span>
        <textarea
          name="bodyTemplate"
          defaultValue={template.bodyTemplate}
          rows={4}
          required
          aria-label={`${fieldPrefix} body`}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-[var(--color-ink)]">Provider template name (optional)</span>
        <input
          type="text"
          name="providerTemplateName"
          defaultValue={template.providerTemplateName ?? ""}
          aria-label={`${fieldPrefix} provider template name`}
          className={inputClass}
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--color-teal)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.success && <p className="text-xs text-[var(--color-teal)]">Saved.</p>}
        {state.error && (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
