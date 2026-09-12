"use client";

import { useActionState } from "react";
import { Field } from "../_components/Field";
import { LocalizedField, type LocalizedValue } from "../_components/LocalizedField";
import { saveSettings, type SaveSettingsState } from "./actions";
import type { HoursSettings } from "@/modules/cms/settings";

const DAYS: { key: keyof HoursSettings; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

interface SettingsFormProps {
  name: LocalizedValue;
  address: LocalizedValue;
  phone: string;
  whatsapp: string;
  email: string;
  hours: HoursSettings;
  instagram: string;
  tiktok: string;
  snapchat: string;
  x: string;
  defaultTitle: LocalizedValue;
  defaultDesc: LocalizedValue;
  /** SiteSetting("comms").otpChannel -- fallback delivery channel for one-time codes. */
  otpChannel: "AUTO" | "WHATSAPP" | "SMS" | "EMAIL";
  /** The provider-derived default channel for booking messages (read-only; see COMMS_BOOKING_CHANNEL). */
  bookingChannel: string;
}

const OTP_CHANNEL_OPTIONS: { value: "AUTO" | "WHATSAPP" | "SMS" | "EMAIL"; label: string }[] = [
  { value: "AUTO", label: "Automatic (booking channel for phones, email for emails)" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "EMAIL", label: "Email" },
];

const initialState: SaveSettingsState = {};

const sectionClass = "flex flex-col gap-4 rounded border border-[var(--color-ink)]/10 p-5";
const inputClass =
  "w-full rounded border border-[var(--color-ink)]/20 px-3 py-2 text-sm text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none";

export function SettingsForm({
  name,
  address,
  phone,
  whatsapp,
  email,
  hours,
  instagram,
  tiktok,
  snapchat,
  x,
  defaultTitle,
  defaultDesc,
  otpChannel,
  bookingChannel,
}: SettingsFormProps) {
  const [state, action, pending] = useActionState(saveSettings, initialState);

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-8">
      <section className={sectionClass}>
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Business</h2>
        <LocalizedField label="Business name" name="name" defaultValue={name} />
        <LocalizedField label="Address" name="address" defaultValue={address} type="textarea" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Phone" name="phone" type="tel" defaultValue={phone} />
          <Field label="WhatsApp" name="whatsapp" type="tel" defaultValue={whatsapp} />
          <Field label="Email" name="email" type="email" defaultValue={email} />
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Hours</h2>
        <div className="flex flex-col gap-3">
          {DAYS.map((day) => {
            const dayHours = hours[day.key];
            return (
              <div key={day.key} className="grid grid-cols-4 items-end gap-3 sm:grid-cols-[8rem_1fr_1fr_auto]">
                <span className="text-sm font-medium text-[var(--color-ink)]">{day.label}</span>
                <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/70">
                  Open
                  <input
                    type="text"
                    name={`hours.${day.key}.open`}
                    defaultValue={dayHours.open}
                    placeholder="09:00"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/70">
                  Close
                  <input
                    type="text"
                    name={`hours.${day.key}.close`}
                    defaultValue={dayHours.close}
                    placeholder="18:00"
                    className={inputClass}
                  />
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm text-[var(--color-ink)]">
                  <input type="checkbox" name={`hours.${day.key}.closed`} defaultChecked={dayHours.closed} />
                  Closed
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Social</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Instagram" name="instagram" defaultValue={instagram} />
          <Field label="TikTok" name="tiktok" defaultValue={tiktok} />
          <Field label="Snapchat" name="snapchat" defaultValue={snapchat} />
          <Field label="X" name="x" defaultValue={x} />
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">SEO defaults</h2>
        <LocalizedField label="Default title" name="defaultTitle" defaultValue={defaultTitle} />
        <LocalizedField label="Default description" name="defaultDesc" type="textarea" defaultValue={defaultDesc} />
      </section>

      <section className={sectionClass} data-testid="communications-settings">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">Communications</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-[var(--color-ink)]">One-time code (OTP) channel</span>
            <select name="comms.otpChannel" defaultValue={otpChannel} className={inputClass} data-testid="otp-channel-select">
              {OTP_CHANNEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--color-ink)]/60">
              Used when a client has no personal preference set. An email identifier always delivers by email
              regardless of this setting.
            </span>
          </label>
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-[var(--color-ink)]">Default booking channel</span>
            <p className="rounded border border-[var(--color-ink)]/10 bg-[var(--color-cream)]/40 px-3 py-2 text-sm text-[var(--color-ink)]/80" data-testid="booking-channel-readonly">
              {bookingChannel}
            </p>
            <span className="text-xs text-[var(--color-ink)]/60">
              Set via the COMMS_BOOKING_CHANNEL / COMMS_PROVIDER environment variables — read-only here.
            </span>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--color-teal)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state?.success && <p className="text-sm text-[var(--color-teal)]">Saved.</p>}
        {state?.error && (
          <p role="alert" className="text-sm text-red-600">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
