"use client";

// The signed-in client's notification preferences: delivery channel + three
// opt-in toggles (reminders, post-visit, marketing). Backed by
// upsertPreference (src/modules/comms/preferences.ts) via the
// updateNotificationPreference server action, which re-derives the caller's
// clientProfileId from the session cookie -- this component never sends one.
//
// SCOPE NOTE: this panel only covers channel + opt-ins. Attaching a second
// identifier (e.g. a phone-first client adding an email) requires verifying
// it by OTP first and is an intentional follow-up, not implemented here --
// see actions.ts's updateNotificationPreference doc comment.

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { updateNotificationPreference } from "./actions";
import type { CommsChannelPref } from "@prisma/client";

export interface NotificationPreferenceDTO {
  channel: CommsChannelPref;
  remindersOptIn: boolean;
  postVisitOptIn: boolean;
  marketingOptIn: boolean;
}

interface NotificationsPanelProps {
  locale: "en" | "ar";
  preference: NotificationPreferenceDTO;
}

const CHANNELS: CommsChannelPref[] = ["AUTO", "WHATSAPP", "SMS", "EMAIL"];

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  testId,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  testId: string;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-xl border border-[var(--color-ink)]/10 p-4">
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-[var(--color-ink)]">{label}</span>
        <span className="text-xs text-[var(--color-ink)]/60">{hint}</span>
      </span>
      <input
        type="checkbox"
        data-testid={testId}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-teal)]"
      />
    </label>
  );
}

export function NotificationsPanel({ locale, preference }: NotificationsPanelProps) {
  const t = useTranslations("account.notifications");
  const [isPending, startTransition] = useTransition();

  const [channel, setChannel] = useState<CommsChannelPref>(preference.channel);
  const [remindersOptIn, setRemindersOptIn] = useState(preference.remindersOptIn);
  const [postVisitOptIn, setPostVisitOptIn] = useState(preference.postVisitOptIn);
  const [marketingOptIn, setMarketingOptIn] = useState(preference.marketingOptIn);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateNotificationPreference(
        { channel, remindersOptIn, postVisitOptIn, marketingOptIn },
        locale,
      );
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <section className="lunia-card flex flex-col gap-6 p-6" data-testid="notifications-panel">
      <div className="flex flex-col gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">{t("heading")}</h2>
        <p className="text-sm text-[var(--color-ink)]/65">{t("intro")}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
            {t("channelLabel")}
          </span>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as CommsChannelPref)}
            className="lunia-input"
            data-testid="notifications-channel"
          >
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {t(`channel.${c}`)}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-3">
          <ToggleRow
            label={t("remindersLabel")}
            hint={t("remindersHint")}
            checked={remindersOptIn}
            onChange={setRemindersOptIn}
            testId="notifications-reminders"
          />
          <ToggleRow
            label={t("postVisitLabel")}
            hint={t("postVisitHint")}
            checked={postVisitOptIn}
            onChange={setPostVisitOptIn}
            testId="notifications-post-visit"
          />
          <ToggleRow
            label={t("marketingLabel")}
            hint={t("marketingHint")}
            checked={marketingOptIn}
            onChange={setMarketingOptIn}
            testId="notifications-marketing"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={isPending} className="lunia-btn lunia-btn-primary w-fit disabled:opacity-60">
            {isPending ? t("savingLabel") : t("saveLabel")}
          </button>
          {saved && !isPending && (
            <p className="text-sm font-medium text-[var(--color-teal)]" data-testid="notifications-saved">
              {t("savedLabel")}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {error}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
