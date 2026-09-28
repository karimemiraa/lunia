"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "../../_ui/ConfirmDialog";
import { Field, SelectField, TextareaField } from "../../_ui/Field";
import { InlineStatus, SubmitButton } from "../../_ui/Form";
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

  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const [asking, setAsking] = useState(false);
  const count = selected?.count ?? 0;

  // First submit opens the confirm dialog; confirming re-submits for real.
  function confirmSend(e: React.FormEvent<HTMLFormElement>) {
    if (confirmed.current) {
      confirmed.current = false;
      return;
    }
    e.preventDefault();
    if (!formRef.current?.reportValidity()) return;
    setAsking(true);
  }
  function reallySend() {
    setAsking(false);
    confirmed.current = true;
    formRef.current?.requestSubmit();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form ref={formRef} action={action} onSubmit={confirmSend} className="flex flex-col gap-4">
        <input type="hidden" name="audienceLabel" value={audienceLabel} />

        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Channel" name="channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </SelectField>
          <SelectField label="Language" name="locale" value={locale} onChange={(e) => setLocale(e.target.value)}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </SelectField>
        </div>

        <SelectField
          label="Audience"
          name="audience"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          data-testid="broadcast-audience"
          help={`${count} customer${count === 1 ? "" : "s"} will receive this. Customers who opted out of marketing are excluded automatically.`}
        >
          {audiences.map((a) => (
            <option key={a.key} value={a.key}>
              {a.label} · {a.count}
            </option>
          ))}
        </SelectField>

        {channel === "email" && (
          <Field label="Subject line" name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={120} />
        )}

        <TextareaField
          label="Message"
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          required
          dir={locale.startsWith("ar") ? "rtl" : "ltr"}
          inputClassName="leading-relaxed"
          placeholder={locale.startsWith("ar") ? "اكتب رسالتك هنا…" : "Write your message here…"}
          help={
            <>
              Use <code className="font-mono">{"{{name}}"}</code> to greet each customer by their first name.
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pending={pending} pendingLabel="Sending…">
            Send broadcast
          </SubmitButton>
          <InlineStatus
            success={
              state.result
                ? `Sent to ${state.result.sentCount} of ${state.result.recipientCount}${state.result.failedCount > 0 ? ` · ${state.result.failedCount} failed` : ""}${
                    state.result.skippedNoContact > 0 ? ` · ${state.result.skippedNoContact} had no ${channel === "email" ? "email" : "phone"}` : ""
                  }`
                : undefined
            }
            error={state.error}
          />
        </div>
        <ConfirmDialog
          open={asking}
          title={`Send to ${count} customer${count === 1 ? "" : "s"}?`}
          description={`This ${CHANNELS.find((c) => c.value === channel)?.label ?? channel} broadcast goes to “${audienceLabel}” now and cannot be recalled.`}
          confirmLabel="Send broadcast"
          onConfirm={reallySend}
          onCancel={() => setAsking(false)}
        />
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
