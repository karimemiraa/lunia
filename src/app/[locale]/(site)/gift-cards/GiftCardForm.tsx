"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { buyGiftCardAction } from "./actions";

const PRESETS_SAR = [200, 300, 500, 1000];

const inputClass =
  "w-full rounded-[var(--radius)] border border-[var(--color-ink)]/15 bg-[var(--color-page)] px-4 py-3 text-base text-[var(--color-ink)] placeholder:text-[var(--color-ink)]/40 focus:border-[var(--color-teal)] focus:outline-none";
const labelClass = "text-sm font-medium text-[var(--color-ink)]";

export function GiftCardForm({ locale }: { locale: "en" | "ar" }) {
  const t = useTranslations("giftCards");
  const [isPending, startTransition] = useTransition();

  const [amount, setAmount] = useState(300);
  const [customMode, setCustomMode] = useState(false);
  const [purchaserName, setPurchaserName] = useState("");
  const [purchaserEmail, setPurchaserEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ code: string; amountMinor: number } | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!Number.isFinite(amount) || amount < 50 || amount > 5000) {
      setError(t("errors.amount"));
      return;
    }
    startTransition(async () => {
      const result = await buyGiftCardAction({
        amountMinor: Math.round(amount * 100),
        purchaserName,
        purchaserEmail,
        recipientName: recipientName || undefined,
        recipientEmail: recipientEmail || undefined,
        message: message || undefined,
        locale,
      });
      if (result.ok) setSuccess({ code: result.code, amountMinor: result.amountMinor });
      else setError(t("errors.generic"));
    });
  }

  if (success) {
    return (
      <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[var(--color-teal)]/40 bg-[var(--color-teal)]/[0.07] p-8 text-center">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">{t("success.heading")}</h2>
        <p className="text-sm text-[var(--color-ink)]/70">{t("success.intro")}</p>
        <p dir="ltr" className="mx-auto rounded-[var(--radius)] border border-[var(--color-teal)] bg-white px-6 py-4 font-mono text-2xl font-bold tracking-[0.25em] text-[var(--color-ink)]">
          {success.code}
        </p>
        <p className="text-sm text-[var(--color-ink)]/60">
          {t("success.amountLabel")}: {(success.amountMinor / 100).toLocaleString(locale === "ar" ? "ar-SA" : "en-US")} SAR
        </p>
        <button
          type="button"
          onClick={() => {
            setSuccess(null);
            setMessage("");
          }}
          className="mx-auto mt-2 w-fit rounded-full border border-[var(--color-ink)]/20 px-6 py-2.5 text-sm font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-ink)]/5"
        >
          {t("success.another")}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
      <div className="flex flex-col gap-3">
        <span className={labelClass}>{t("form.amountLabel")}</span>
        <div className="flex flex-wrap gap-2">
          {PRESETS_SAR.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setAmount(v); setCustomMode(false); }}
              className={`rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${
                !customMode && amount === v ? "bg-[var(--color-teal)] text-[var(--color-ink)]" : "border border-[var(--color-ink)]/20 text-[var(--color-ink)]/75 hover:bg-[var(--color-ink)]/5"
              }`}
            >
              {v.toLocaleString(locale === "ar" ? "ar-SA" : "en-US")} SAR
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomMode(true)}
            className={`rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${
              customMode ? "bg-[var(--color-teal)] text-[var(--color-ink)]" : "border border-[var(--color-ink)]/20 text-[var(--color-ink)]/75 hover:bg-[var(--color-ink)]/5"
            }`}
          >
            {t("form.custom")}
          </button>
        </div>
        {customMode && (
          <input
            type="number"
            min={50}
            max={5000}
            step={10}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className={inputClass}
            aria-label={t("form.amountLabel")}
          />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t("form.purchaserName")}</span>
          <input required value={purchaserName} onChange={(e) => setPurchaserName(e.target.value)} className={inputClass} autoComplete="name" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t("form.purchaserEmail")}</span>
          <input required type="email" value={purchaserEmail} onChange={(e) => setPurchaserEmail(e.target.value)} className={inputClass} autoComplete="email" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t("form.recipientName")}</span>
          <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{t("form.recipientEmail")}</span>
          <input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} className={inputClass} />
          <span className="text-xs text-[var(--color-ink)]/50">{t("form.recipientHint")}</span>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>{t("form.messageLabel")}</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={500} className={inputClass} />
      </label>

      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}

      <div className="flex flex-col gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex w-fit items-center justify-center rounded-full bg-[var(--color-ink)] px-8 py-3.5 text-sm font-medium tracking-wide text-[var(--color-page)] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {isPending ? t("form.submitting") : t("form.submit")}
        </button>
        <span className="text-xs text-[var(--color-ink)]/50">{t("form.secure")}</span>
      </div>
    </form>
  );
}
