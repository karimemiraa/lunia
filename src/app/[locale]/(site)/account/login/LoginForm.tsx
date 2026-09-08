"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startLoginOtp, verifyLogin } from "./actions";

interface LoginFormProps {
  locale: "en" | "ar";
}

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]";

const inputClass = `w-full rounded-xl border border-[var(--color-ink)]/15 bg-[var(--color-page)] px-4 py-3 text-base text-[var(--color-ink)] placeholder:text-[var(--color-ink)]/40 transition-colors focus:border-[var(--color-teal)] ${focusRingClass}`;

const labelClass = "text-sm font-medium text-[var(--color-ink)]";

const primaryButtonClass = `inline-flex items-center justify-center whitespace-nowrap rounded-full bg-[var(--color-teal)] px-8 py-3.5 text-sm font-medium tracking-wide text-[var(--color-ink)] transition-colors hover:bg-[var(--color-canopy)] disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`;

// Phone -> OTP -> session cookie sign-in, mirroring the booking wizard's
// contact step (BookingWizard.tsx step 3) but standalone: it only signs the
// client in and hands off to /account, without creating a booking.
export function LoginForm({ locale }: LoginFormProps) {
  const t = useTranslations("account.login");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const phoneId = useId();
  const codeId = useId();

  function handleSendCode() {
    setError(null);
    if (!phone.trim()) {
      setError(t("errors.missingPhone"));
      return;
    }
    startTransition(async () => {
      const result = await startLoginOtp(phone, locale);
      if (result.ok) {
        setOtpSent(true);
        setDevCode(result.devCode ?? null);
      } else {
        setError(result.error);
      }
    });
  }

  function handleVerify() {
    setError(null);
    startTransition(async () => {
      const result = await verifyLogin({ phone, code, locale });
      if (result.ok) {
        router.push(`/${locale}/account`);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      data-testid="account-login-form"
      onSubmit={(e) => e.preventDefault()}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={phoneId} className={labelClass}>
          {t("phoneLabel")}
        </label>
        <input
          id={phoneId}
          type="tel"
          required
          maxLength={20}
          autoComplete="tel"
          value={phone}
          disabled={otpSent}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
      </div>

      {!otpSent ? (
        <button
          type="button"
          onClick={handleSendCode}
          disabled={isPending}
          className={`w-fit ${primaryButtonClass}`}
        >
          {isPending ? t("sendingLabel") : t("sendCodeLabel")}
        </button>
      ) : (
        <>
          <p className="text-sm text-[var(--color-ink)]/65">{t("codeIntro", { phone })}</p>
          {devCode && (
            <p data-testid="dev-otp-code" className="text-sm font-medium text-[var(--color-canopy)]">
              {t("devCodeHint", { code: devCode })}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <label htmlFor={codeId} className={labelClass}>
              {t("codeLabel")}
            </label>
            <input
              id={codeId}
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className={inputClass}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleVerify}
              disabled={isPending || code.length !== 6}
              className={primaryButtonClass}
            >
              {isPending ? t("verifyingLabel") : t("verifyLabel")}
            </button>
            <button
              type="button"
              onClick={() => {
                setOtpSent(false);
                setDevCode(null);
                setCode("");
                setError(null);
              }}
              className="text-sm font-medium text-[var(--color-ink)] underline decoration-[var(--color-gold)] decoration-2 underline-offset-4"
            >
              {t("changeNumberLabel")}
            </button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
