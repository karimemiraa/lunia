"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { buyGiftCardAction } from "./actions";
import { FieldError, isValidEmail } from "@/components/site/forms";

const PRESETS_SAR = [200, 300, 500, 1000];
const MIN_SAR = 50;
const MAX_SAR = 5000;

type FieldName = "amount" | "purchaserName" | "purchaserEmail" | "recipientEmail";
type Errors = Partial<Record<FieldName, string>>;

// The gift-card purchase form: preset or custom amount, buyer, optional
// recipient and note. Validates on blur and again on submit (errors sit next
// to their field), shows a pending state while the purchase runs, and ends
// on a success card with the code, a copy action and the next step.
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
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ code: string; amountMinor: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const successRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLInputElement>(null);

  const amountId = useId();
  const purchaserNameId = useId();
  const purchaserEmailId = useId();
  const recipientNameId = useId();
  const recipientEmailId = useId();
  const messageId = useId();

  function validate(field: FieldName, value: string | number): string | undefined {
    if (field === "amount") {
      const n = Number(value);
      return Number.isFinite(n) && n >= MIN_SAR && n <= MAX_SAR ? undefined : t("errors.amount");
    }
    const v = String(value).trim();
    if (field === "purchaserName") return v.length >= 2 ? undefined : t("errors.purchaserName");
    if (field === "purchaserEmail") return isValidEmail(v) ? undefined : t("errors.purchaserEmail");
    return !v || isValidEmail(v) ? undefined : t("errors.recipientEmail");
  }

  function check(field: FieldName, value: string | number) {
    setErrors((prev) => ({ ...prev, [field]: validate(field, value) }));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    // Honeypot: a filled hidden field means a bot — pretend it worked.
    if (honeypot) {
      setSuccess({ code: "XXXX-XXXX-XXXX-XXXX", amountMinor: Math.round(amount * 100) });
      return;
    }
    const next: Errors = {
      amount: validate("amount", amount),
      purchaserName: validate("purchaserName", purchaserName),
      purchaserEmail: validate("purchaserEmail", purchaserEmail),
      recipientEmail: validate("recipientEmail", recipientEmail),
    };
    setErrors(next);
    const firstInvalid = (["amount", "purchaserName", "purchaserEmail", "recipientEmail"] as const).find((f) => next[f]);
    if (firstInvalid) {
      const idFor: Record<FieldName, string> = { amount: amountId, purchaserName: purchaserNameId, purchaserEmail: purchaserEmailId, recipientEmail: recipientEmailId };
      (e.currentTarget.querySelector<HTMLElement>(`#${CSS.escape(idFor[firstInvalid])}`) ?? e.currentTarget.querySelector<HTMLElement>("[aria-invalid='true']"))?.focus();
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

  useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  useEffect(() => {
    if (customMode) customRef.current?.focus();
  }, [customMode]);

  async function copyCode() {
    if (!success) return;
    try {
      await navigator.clipboard.writeText(success.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure context / permissions): the code is still on screen.
    }
  }

  if (success) {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="lx-surface flex flex-col items-center gap-4 rounded-[28px] p-8 text-center outline-none sm:p-10"
        data-testid="gift-card-success"
      >
        <h2 className="lx-display text-[clamp(1.9rem,1.5rem+1vw,2.5rem)] text-[var(--color-ink)]">{t("success.heading")}</h2>
        <p className="max-w-md text-sm leading-relaxed text-[var(--color-ink)]/75">{t("success.intro")}</p>
        <p dir="ltr" className="lx-on-light lx-light-stage mx-auto rounded-[var(--radius)] border border-[var(--color-teal)] px-6 py-4 font-mono text-2xl font-bold tracking-[0.25em] text-[var(--color-ink)]">
          {success.code}
        </p>
        <p className="text-sm text-[var(--color-ink)]/75">
          {t("success.amountLabel")}: {(success.amountMinor / 100).toLocaleString(locale === "ar" ? "ar-SA" : "en-US")} SAR
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={copyCode} className="lx-pill lx-pill-ghost" aria-live="polite">
            {copied ? t("success.copied") : t("success.copy")}
          </button>
          <Link href={`/${locale}/book`} className="lx-pill">
            {t("success.bookNow")}
          </Link>
          <button
            type="button"
            onClick={() => {
              setSuccess(null);
              setMessage("");
              setRecipientName("");
              setRecipientEmail("");
            }}
            className="lx-link"
          >
            {t("success.another")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="lx-surface relative flex flex-col gap-6 rounded-[28px] p-7 sm:p-10" noValidate>
      <div className="lx-hp" aria-hidden="true">
        <label htmlFor="gift-website">Website</label>
        <input id="gift-website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="lx-label mb-3">{t("form.amountLabel")}</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("form.amountLabel")}>
          {PRESETS_SAR.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={!customMode && amount === v}
              onClick={() => {
                setCustomMode(false);
                setAmount(v);
                check("amount", v);
              }}
              className="lx-choice lx-choice-pill min-h-11 px-5 py-2 text-sm font-medium"
            >
              {v.toLocaleString(locale === "ar" ? "ar-SA" : "en-US")} SAR
            </button>
          ))}
          <button
            type="button"
            aria-pressed={customMode}
            onClick={() => setCustomMode(true)}
            className="lx-choice lx-choice-pill min-h-11 px-5 py-2 text-sm font-medium"
          >
            {t("form.custom")}
          </button>
        </div>
        {customMode && (
          <div className="flex flex-col gap-2">
            <label htmlFor={amountId} className="lx-label">
              {t("form.customAmountLabel")}
            </label>
            <input
              ref={customRef}
              id={amountId}
              type="number"
              inputMode="numeric"
              min={MIN_SAR}
              max={MAX_SAR}
              step={10}
              dir="ltr"
              value={amount}
              onChange={(e) => {
                setAmount(Number(e.target.value));
                if (errors.amount) check("amount", e.target.value);
              }}
              onBlur={(e) => check("amount", e.target.value)}
              aria-invalid={errors.amount ? true : undefined}
              aria-describedby={`${amountId}-help${errors.amount ? ` ${amountId}-err` : ""}`}
              className="lx-input text-start sm:max-w-xs"
            />
            <p id={`${amountId}-help`} className="lx-help">
              {t("form.amountHelp", { min: MIN_SAR, max: MAX_SAR })}
            </p>
            <FieldError id={`${amountId}-err`} message={errors.amount} />
          </div>
        )}
        {!customMode && <FieldError id={`${amountId}-err`} message={errors.amount} />}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor={purchaserNameId} className="lx-label">
            {t("form.purchaserName")} <span aria-hidden="true">*</span>
          </label>
          <input
            id={purchaserNameId}
            required
            autoComplete="name"
            value={purchaserName}
            onChange={(e) => {
              setPurchaserName(e.target.value);
              if (errors.purchaserName) check("purchaserName", e.target.value);
            }}
            onBlur={(e) => check("purchaserName", e.target.value)}
            aria-invalid={errors.purchaserName ? true : undefined}
            aria-describedby={errors.purchaserName ? `${purchaserNameId}-err` : undefined}
            className="lx-input"
          />
          <FieldError id={`${purchaserNameId}-err`} message={errors.purchaserName} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={purchaserEmailId} className="lx-label">
            {t("form.purchaserEmail")} <span aria-hidden="true">*</span>
          </label>
          <input
            id={purchaserEmailId}
            required
            type="email"
            inputMode="email"
            dir="ltr"
            autoComplete="email"
            value={purchaserEmail}
            onChange={(e) => {
              setPurchaserEmail(e.target.value);
              if (errors.purchaserEmail) check("purchaserEmail", e.target.value);
            }}
            onBlur={(e) => check("purchaserEmail", e.target.value)}
            aria-invalid={errors.purchaserEmail ? true : undefined}
            aria-describedby={`${purchaserEmailId}-help${errors.purchaserEmail ? ` ${purchaserEmailId}-err` : ""}`}
            className="lx-input text-start"
          />
          <p id={`${purchaserEmailId}-help`} className="lx-help">
            {t("form.purchaserEmailHint")}
          </p>
          <FieldError id={`${purchaserEmailId}-err`} message={errors.purchaserEmail} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={recipientNameId} className="lx-label">
            {t("form.recipientName")}
          </label>
          <input id={recipientNameId} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className="lx-input" />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={recipientEmailId} className="lx-label">
            {t("form.recipientEmail")}
          </label>
          <input
            id={recipientEmailId}
            type="email"
            inputMode="email"
            dir="ltr"
            value={recipientEmail}
            onChange={(e) => {
              setRecipientEmail(e.target.value);
              if (errors.recipientEmail) check("recipientEmail", e.target.value);
            }}
            onBlur={(e) => check("recipientEmail", e.target.value)}
            aria-invalid={errors.recipientEmail ? true : undefined}
            aria-describedby={`${recipientEmailId}-help${errors.recipientEmail ? ` ${recipientEmailId}-err` : ""}`}
            className="lx-input text-start"
          />
          <p id={`${recipientEmailId}-help`} className="lx-help">
            {t("form.recipientHint")}
          </p>
          <FieldError id={`${recipientEmailId}-err`} message={errors.recipientEmail} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={messageId} className="lx-label">
          {t("form.messageLabel")}
        </label>
        <textarea id={messageId} value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={500} className="lx-input resize-y" />
        <p className="lx-help">{t("form.messageHint", { max: 500 })}</p>
      </div>

      {error && (
        <p role="alert" className="lx-notice lx-notice-error">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button type="submit" disabled={isPending} aria-busy={isPending || undefined} className="lx-pill lx-pill-ink w-fit">
          {isPending ? t("form.submitting") : t("form.submit")}
        </button>
        <span className="lx-help">{t("form.secure")}</span>
      </div>
    </form>
  );
}
