"use client";

import { useActionState, useId } from "react";
import { updateNotificationPreferenceAction, type ClientActionState } from "./actions";
import type { CommsChannelPref } from "@prisma/client";

interface NotificationPreferenceEditorProps {
  clientProfileId: string;
  preference: {
    channel: CommsChannelPref;
    remindersOptIn: boolean;
    postVisitOptIn: boolean;
    marketingOptIn: boolean;
  };
}

const initialState: ClientActionState = {};

const selectClass =
  "rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

const CHANNEL_OPTIONS: { value: CommsChannelPref; label: string }[] = [
  { value: "AUTO", label: "Automatic" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "EMAIL", label: "Email" },
];

// Only rendered when the current admin holds CLIENT_MANAGE (see
// [id]/page.tsx) -- updateNotificationPreferenceAction re-checks that
// permission itself regardless, mirroring TierEditor.
export function NotificationPreferenceEditor({ clientProfileId, preference }: NotificationPreferenceEditorProps) {
  const [state, action, pending] = useActionState(updateNotificationPreferenceAction, initialState);
  const selectId = useId();

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="notification-preference-editor">
      <input type="hidden" name="clientProfileId" value={clientProfileId} />

      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor={selectId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-[var(--color-ink)]">Channel</span>
          <select id={selectId} name="channel" defaultValue={preference.channel} className={selectClass}>
            {CHANNEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2 text-[var(--color-ink)]">
          <input type="checkbox" name="remindersOptIn" defaultChecked={preference.remindersOptIn} />
          Appointment reminders
        </label>
        <label className="flex items-center gap-2 text-[var(--color-ink)]">
          <input type="checkbox" name="postVisitOptIn" defaultChecked={preference.postVisitOptIn} />
          Post-visit messages
        </label>
        <label className="flex items-center gap-2 text-[var(--color-ink)]">
          <input type="checkbox" name="marketingOptIn" defaultChecked={preference.marketingOptIn} />
          Offers and marketing
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="w-fit lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save preferences"}
        </button>
        {state.success && <p className="text-sm text-[var(--color-teal)]">Saved.</p>}
        {state.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
