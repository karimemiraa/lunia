"use client";

import { useActionState } from "react";
import { Field } from "../_components/Field";
import { LocalizedField, type LocalizedValue } from "../_components/LocalizedField";
import { saveSettings, type SaveSettingsState } from "./actions";
import type { HoursSettings } from "@/modules/cms/settings";
import { InlineStatus } from "../_ui/Form";
import { useStaffLocale, useStaffT } from "../_i18n/StaffI18n";
import { translateIn } from "../_i18n/t";

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
  /** SiteSetting("comms").otpChannel -- also restricts the website login identifier. */
  otpChannel: "AUTO" | "WHATSAPP" | "SMS" | "EMAIL";
  /** SiteSetting("comms").defaultBookingChannel -- editable default for booking messages. */
  defaultBookingChannel: "whatsapp" | "sms";
}

const OTP_CHANNEL_OPTIONS: { value: "AUTO" | "WHATSAPP" | "SMS" | "EMAIL"; label: string }[] = [
  { value: "AUTO", label: "Automatic (booking channel for phones, email for emails)" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "EMAIL", label: "Email" },
];

const initialState: SaveSettingsState = {};

const sectionClass = "flex flex-col gap-4 lunia-card p-5";
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
  defaultBookingChannel,
}: SettingsFormProps) {
  const [state, action, pending] = useActionState(saveSettings, initialState);
  const t = useStaffT();
  const locale = useStaffLocale();

  return (
    <form action={action} className="flex max-w-3xl flex-col gap-8">
      <section className={sectionClass}>
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Business")}</h2>
        <LocalizedField label={t("Business name")} name="name" defaultValue={name} />
        <LocalizedField label={t("Address")} name="address" defaultValue={address} type="textarea" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t("Phone")} name="phone" type="tel" defaultValue={phone} dir="ltr" />
          <Field label={t("WhatsApp")} name="whatsapp" type="tel" defaultValue={whatsapp} dir="ltr" />
          <Field label={t("Email")} name="email" type="email" defaultValue={email} dir="ltr" />
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Hours")}</h2>
        <div className="flex flex-col gap-3">
          {DAYS.map((day) => {
            const dayHours = hours[day.key];
            return (
              <div key={day.key} className="grid grid-cols-4 items-end gap-3 sm:grid-cols-[8rem_1fr_1fr_auto]">
                <span className="text-sm font-medium text-[var(--color-ink)]">{t(day.label)}</span>
                <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/70">
                  {translateIn("Open", "hours", locale)}
                  <input
                    type="text"
                    name={`hours.${day.key}.open`}
                    defaultValue={dayHours.open}
                    placeholder="09:00"
                    dir="ltr"
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs text-[var(--color-ink)]/70">
                  {translateIn("Close", "hours", locale)}
                  <input
                    type="text"
                    name={`hours.${day.key}.close`}
                    defaultValue={dayHours.close}
                    placeholder="18:00"
                    dir="ltr"
                    className={inputClass}
                  />
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm text-[var(--color-ink)]">
                  <input type="checkbox" name={`hours.${day.key}.closed`} defaultChecked={dayHours.closed} />
                  {t("Closed")}
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Social")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Instagram" name="instagram" defaultValue={instagram} dir="ltr" />
          <Field label="TikTok" name="tiktok" defaultValue={tiktok} dir="ltr" />
          <Field label="Snapchat" name="snapchat" defaultValue={snapchat} dir="ltr" />
          <Field label="X" name="x" defaultValue={x} dir="ltr" />
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("SEO defaults")}</h2>
        <LocalizedField label={t("Default title")} name="defaultTitle" defaultValue={defaultTitle} />
        <LocalizedField label={t("Default description")} name="defaultDesc" type="textarea" defaultValue={defaultDesc} />
      </section>

      <section className={sectionClass} data-testid="communications-settings">
        <h2 className="text-lg font-semibold text-[var(--color-ink)]">{t("Communications")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-[var(--color-ink)]">{t("One-time code (OTP) channel")}</span>
            <select name="comms.otpChannel" defaultValue={otpChannel} className={inputClass} data-testid="otp-channel-select">
              {OTP_CHANNEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--color-ink)]/60">
              {t("Also controls how customers sign in on the website:")} <strong>{t("Email")}</strong> → {t("email only")},{" "}
              <strong>{t("WhatsApp/SMS")}</strong> → {t("phone only")}, <strong>{t("Automatic")}</strong> → {t("phone or email")}.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-[var(--color-ink)]">{t("Default booking channel")}</span>
            <select name="comms.defaultBookingChannel" defaultValue={defaultBookingChannel} className={inputClass} data-testid="booking-channel-select">
              <option value="whatsapp">{t("WhatsApp")}</option>
              <option value="sms">{t("SMS")}</option>
            </select>
            <span className="text-xs text-[var(--color-ink)]/60">
              {t("Channel used for booking confirmations and reminders when a customer has no personal preference.")}
            </span>
          </label>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="lunia-btn lunia-btn-primary disabled:opacity-60"
        >
          {pending ? t("Saving…") : t("Save")}
        </button>
        <InlineStatus success={state?.success ? t("Saved.") : undefined} />
        <InlineStatus error={state?.error} />
      </div>
    </form>
  );
}
