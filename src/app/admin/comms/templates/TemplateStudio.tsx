"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { updateTemplateAction, type TemplateActionState } from "./actions";
import { renderEmailHtml } from "@/modules/comms/emailLayout";
import {
  CHANNEL_LABELS,
  KIND_META,
  LOCALE_LABELS,
  defaultBody,
  interpolateTemplate,
  sampleParams,
  sampleRecipientName,
  subjectForTemplate,
} from "@/modules/comms/templateCatalog";

export interface StudioTemplate {
  kind: string;
  locale: string;
  channel: string;
  bodyTemplate: string;
  providerTemplateName: string | null;
  isActive: boolean;
  /** Whether a MessageTemplate row already exists (vs. a not-yet-saved default). */
  exists: boolean;
}

function keyOf(t: { kind: string; locale: string; channel: string }): string {
  return `${t.kind}|${t.locale}|${t.channel}`;
}

const initialState: TemplateActionState = {};

// The live customer-facing preview. Email is rendered through the exact same
// renderEmailHtml() the send path uses, inside a sandboxed iframe so it looks
// precisely as the customer receives it. WhatsApp/SMS render as a plain
// message bubble (no HTML wrapper on those channels).
function Preview({ kind, locale, channel, body }: { kind: string; locale: string; channel: string; body: string }) {
  const isAr = locale.toLowerCase().startsWith("ar");
  const params = sampleParams(locale);
  const interpolated = interpolateTemplate(body, params);

  if (channel === "email") {
    const html = renderEmailHtml({
      subject: subjectForTemplate(kind, locale),
      body: interpolated,
      recipientName: sampleRecipientName(locale),
      locale,
    });
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-[var(--color-ink)]/55">
          Subject: <span className="font-medium text-[var(--color-ink)]/80">{subjectForTemplate(kind, locale)}</span>
        </p>
        <iframe
          title="Email preview"
          srcDoc={html}
          sandbox=""
          className="h-[520px] w-full rounded-[var(--radius-md)] border border-[var(--line)] bg-white"
        />
      </div>
    );
  }

  const bubbleBg = channel === "whatsapp" ? "#dcf8c6" : "#e9edf2";
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[#e5ddd5] p-5">
      <div
        dir={isAr ? "rtl" : "ltr"}
        style={{ background: bubbleBg }}
        className="ms-auto max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed text-[#111b21] shadow-sm"
      >
        {interpolated || <span className="text-[#111b21]/40">Nothing to preview yet.</span>}
      </div>
    </div>
  );
}

function Editor({ template }: { template: StudioTemplate }) {
  const [state, action, pending] = useActionState(updateTemplateAction, initialState);
  const [body, setBody] = useState(template.bodyTemplate);
  const [isActive, setIsActive] = useState(template.isActive);
  const meta = KIND_META[template.kind];
  const fallback = defaultBody(template.kind, template.locale);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Editor */}
      <form action={action} className="flex flex-col gap-4" data-testid={`template-form-${keyOf(template)}`}>
        <input type="hidden" name="kind" value={template.kind} />
        <input type="hidden" name="locale" value={template.locale} />
        <input type="hidden" name="channel" value={template.channel} />

        {meta?.placeholders?.length ? (
          <div className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--color-cream)]/50 px-3 py-2.5">
            <p className="text-xs text-[var(--color-ink)]/60">
              Placeholders — click to insert automatically when the message is sent:
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {meta.placeholders.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setBody((b) => `${b}{{${p}}}`)}
                  className="rounded-full border border-[var(--color-teal)]/40 bg-white px-2.5 py-0.5 font-mono text-xs text-[var(--color-tealInk,#2f6d67)] transition-colors hover:bg-[var(--color-teal)]/10"
                >
                  {`{{${p}}}`}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Message content</span>
          <textarea
            name="bodyTemplate"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            required
            dir={template.locale.toLowerCase().startsWith("ar") ? "rtl" : "ltr"}
            aria-label="Template body"
            className="lunia-input font-normal leading-relaxed"
          />
        </label>

        {template.channel !== "email" && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-[var(--color-ink)]">Provider template name (optional)</span>
            <input
              type="text"
              name="providerTemplateName"
              defaultValue={template.providerTemplateName ?? ""}
              aria-label="Provider template name"
              className="lunia-input"
            />
            <span className="text-xs text-[var(--color-ink)]/50">
              Required by WhatsApp/SMS providers (e.g. Meta) for pre-approved templates.
            </span>
          </label>
        )}

        <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
          <input
            type="checkbox"
            name="isActive"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active (send this template)
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest disabled:opacity-60">
            {pending ? "Saving…" : "Save template"}
          </button>
          {fallback && (
            <button
              type="button"
              onClick={() => setBody(fallback)}
              className="lunia-btn lunia-btn-forest-outline"
            >
              Reset to default
            </button>
          )}
          {state.success && <span className="text-xs font-medium text-[var(--color-tealInk,#2f6d67)]">Saved ✓</span>}
          {state.error && (
            <span role="alert" className="text-xs text-red-600">
              {state.error}
            </span>
          )}
        </div>
      </form>

      {/* Live preview */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]/50">
          Exactly what the customer sees
        </p>
        <Preview kind={template.kind} locale={template.locale} channel={template.channel} body={body} />
      </div>
    </div>
  );
}

export function TemplateStudio({ templates }: { templates: StudioTemplate[] }) {
  const byKey = useMemo(() => {
    const m = new Map<string, StudioTemplate>();
    for (const t of templates) m.set(keyOf(t), t);
    return m;
  }, [templates]);

  const [selKey, setSelKey] = useState(templates[0] ? keyOf(templates[0]) : "");
  const selected = byKey.get(selKey) ?? templates[0];

  if (!selected) {
    return <p className="text-sm text-[var(--color-ink)]/60">No templates available.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:max-w-md">
        <label htmlFor="template-picker" className="text-sm font-medium text-[var(--color-ink)]">
          Choose a message to view or edit
        </label>
        <select
          id="template-picker"
          value={selKey}
          onChange={(e) => setSelKey(e.target.value)}
          className="lunia-input"
          data-testid="template-picker"
        >
          {templates.map((t) => (
            <option key={keyOf(t)} value={keyOf(t)}>
              {(KIND_META[t.kind]?.label ?? t.kind)} — {CHANNEL_LABELS[t.channel] ?? t.channel} · {LOCALE_LABELS[t.locale] ?? t.locale}
              {t.exists ? "" : " (default)"}
              {t.exists && !t.isActive ? " · inactive" : ""}
            </option>
          ))}
        </select>
        {KIND_META[selected.kind]?.description && (
          <p className="text-xs text-[var(--color-ink)]/55">{KIND_META[selected.kind].description}</p>
        )}
      </div>

      {/* key forces a fresh Editor (resets body/active state) on selection change. */}
      <Editor key={selKey} template={selected} />
    </div>
  );
}
