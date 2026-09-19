"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { sendBroadcastAction, type BroadcastActionState } from "./actions";
import { renderEmailHtml } from "@/modules/comms/emailLayout";
import { interpolateTemplate } from "@/modules/comms/templateCatalog";
import type { AudienceOption } from "@/modules/comms/broadcast";

const initialState: BroadcastActionState = {};

const CHANNELS = [
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
];

export function BroadcastComposer({ audiences }: { audiences: AudienceOption[] }) {
  const [state, action, pending] = useActionState(sendBroadcastAction, initialState);
  const [channel, setChannel] = useState("email");
  const [locale, setLocale] = useState("ar");
  const [audience, setAudience] = useState(audiences[0]?.key ?? "all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const selected = audiences.find((a) => a.key === audience);
  const audienceLabel = selected?.label ?? audience;
  const sampleName = locale.startsWith("ar") ? "نورة" : "Sarah";
  const previewBody = interpolateTemplate(body, { name: sampleName });

  const emailHtml = useMemo(
    () => renderEmailHtml({ subject: subject || "Lunia", body: previewBody, recipientName: sampleName, locale }),
    [subject, previewBody, sampleName, locale],
  );

  function confirmSend(e: React.FormEvent<HTMLFormElement>) {
    const count = selected?.count ?? 0;
    if (!window.confirm(`Send this ${channel} broadcast to ${count} customer${count === 1 ? "" : "s"} (${audienceLabel})?`)) {
      e.preventDefault();
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={action} onSubmit={confirmSend} className="flex flex-col gap-4">
        <input type="hidden" name="audienceLabel" value={audienceLabel} />

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-[var(--color-ink)]">Channel</span>
            <select name="channel" value={channel} onChange={(e) => setChannel(e.target.value)} className="lunia-input">
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-[var(--color-ink)]">Language</span>
            <select name="locale" value={locale} onChange={(e) => setLocale(e.target.value)} className="lunia-input">
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Audience</span>
          <select name="audience" value={audience} onChange={(e) => setAudience(e.target.value)} className="lunia-input" data-testid="broadcast-audience">
            {audiences.map((a) => (
              <option key={a.key} value={a.key}>{a.label} · {a.count}</option>
            ))}
          </select>
          <span className="text-xs text-[var(--color-ink)]/55">
            {selected?.count ?? 0} customer{(selected?.count ?? 0) === 1 ? "" : "s"} will receive this. Customers who opted out of marketing are excluded automatically.
          </span>
        </label>

        {channel === "email" && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-[var(--color-ink)]">Subject line</span>
            <input type="text" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="lunia-input" />
          </label>
        )}

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Message</span>
          <textarea
            name="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            required
            dir={locale.startsWith("ar") ? "rtl" : "ltr"}
            className="lunia-input leading-relaxed"
            placeholder={locale.startsWith("ar") ? "اكتب رسالتك هنا…" : "Write your message here…"}
          />
          <span className="text-xs text-[var(--color-ink)]/55">
            Tip: use <code className="font-mono">{"{{name}}"}</code> to greet each customer by their first name.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest disabled:opacity-60">
            {pending ? "Sending…" : `Send broadcast`}
          </button>
          {state.result && (
            <span className="text-xs font-medium text-[var(--color-teal-ink,#2f6d67)]">
              Sent to {state.result.sentCount} of {state.result.recipientCount}
              {state.result.failedCount > 0 ? ` · ${state.result.failedCount} failed` : ""}
              {state.result.skippedNoContact > 0 ? ` · ${state.result.skippedNoContact} had no ${channel === "email" ? "email" : "phone"}` : ""}
            </span>
          )}
          {state.error && (
            <span role="alert" className="text-xs text-red-600">{state.error}</span>
          )}
        </div>
      </form>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-ink)]/50">Preview</p>
        {channel === "email" ? (
          <iframe title="Broadcast preview" srcDoc={emailHtml} sandbox="" className="h-[520px] w-full rounded-[var(--radius-md)] border border-[var(--line)] bg-white" />
        ) : (
          <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[#e5ddd5] p-5">
            <div
              dir={locale.startsWith("ar") ? "rtl" : "ltr"}
              style={{ background: channel === "whatsapp" ? "#dcf8c6" : "#e9edf2" }}
              className="ms-auto max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed text-[#111b21] shadow-sm"
            >
              {previewBody || <span className="text-[#111b21]/40">Your message will appear here.</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
