"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startLoginOtp, verifyLogin, loginWithPassword } from "./actions";

interface LoginFormProps {
  locale: "en" | "ar";
  /** Which identifier the center accepts (from comms.otpChannel). */
  identifierMode?: "email" | "phone" | "both";
}

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]";

const inputClass = `w-full rounded-xl border border-[var(--color-ink)]/15 bg-[var(--color-page)] px-4 py-3 text-base text-[var(--color-ink)] placeholder:text-[var(--color-ink)]/40 transition-colors focus:border-[var(--color-teal)] ${focusRingClass}`;

const labelClass = "text-sm font-medium text-[var(--color-ink)]";

const primaryButtonClass = `inline-flex items-center justify-center whitespace-nowrap rounded-full bg-[var(--color-teal)] px-8 py-3.5 text-sm font-medium tracking-wide text-[var(--color-ink)] transition-colors hover:bg-[var(--color-canopy)] disabled:cursor-not-allowed disabled:opacity-60 ${focusRingClass}`;

const switchLinkClass =
  "text-sm font-medium text-[var(--color-ink)] underline decoration-[var(--color-gold)] decoration-2 underline-offset-4";

type Mode = "code" | "password";

// Two ways to sign in with the same phone-or-email identity:
//   - "code":     identifier -> OTP -> session (also captures a name for new
//                 accounts so emails can be personalized),
//   - "password": identifier + password -> session (for clients who set one).
export function LoginForm({ locale, identifierMode = "both" }: LoginFormProps) {
  const t = useTranslations("account.login");
  const idLabel =
    identifierMode === "email" ? t("emailLabel") : identifierMode === "phone" ? t("phoneLabel") : t("identifierLabel");
  const idType = identifierMode === "email" ? "email" : "text";
  const idInputMode = identifierMode === "phone" ? "tel" : "email";
  const idAutoComplete = identifierMode === "email" ? "email" : identifierMode === "phone" ? "tel" : "username";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<Mode>("code");
  const [identifier, setIdentifier] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const identifierId = useId();
  const codeId = useId();
  const nameId = useId();
  const passwordId = useId();

  function onSuccess() {
    router.push(`/${locale}/account`);
    router.refresh();
  }

  function handleSendCode() {
    setError(null);
    if (!identifier.trim()) {
      setError(t("errors.missingIdentifier"));
      return;
    }
    startTransition(async () => {
      const result = await startLoginOtp(identifier, locale);
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
      const result = await verifyLogin({ identifier, code, name, locale });
      if (result.ok) onSuccess();
      else setError(result.error);
    });
  }

  function handlePasswordLogin() {
    setError(null);
    if (!identifier.trim()) {
      setError(t("errors.missingIdentifier"));
      return;
    }
    if (!password) {
      setError(t("errors.missingPassword"));
      return;
    }
    startTransition(async () => {
      const result = await loginWithPassword({ identifier, password, locale });
      if (result.ok) onSuccess();
      else setError(result.error);
    });
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setOtpSent(false);
    setDevCode(null);
    setCode("");
    setPassword("");
  }

  return (
    <form
      data-testid="account-login-form"
      onSubmit={(e) => e.preventDefault()}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={identifierId} className={labelClass}>
          {idLabel}
        </label>
        <input
          id={identifierId}
          type={idType}
          required
          maxLength={120}
          autoComplete={idAutoComplete}
          inputMode={idInputMode}
          value={identifier}
          disabled={otpSent}
          onChange={(e) => setIdentifier(e.target.value)}
          className={inputClass}
        />
      </div>

      {mode === "code" ? (
        !otpSent ? (
          <>
            <button
              type="button"
              onClick={handleSendCode}
              disabled={isPending}
              className={`w-fit ${primaryButtonClass}`}
            >
              {isPending ? t("sendingLabel") : t("sendCodeLabel")}
            </button>
            <button type="button" onClick={() => switchMode("password")} className={`w-fit ${switchLinkClass}`}>
              {t("signInWithPassword")}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--color-ink)]/65">{t("codeIntro", { contact: identifier })}</p>
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
            <div className="flex flex-col gap-2">
              <label htmlFor={nameId} className={labelClass}>
                {t("nameLabel")}
              </label>
              <input
                id={nameId}
                type="text"
                maxLength={120}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-[var(--color-ink)]/55">{t("nameHint")}</p>
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
                className={switchLinkClass}
              >
                {t("changeContactLabel")}
              </button>
            </div>
          </>
        )
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor={passwordId} className={labelClass}>
              {t("passwordLabel")}
            </label>
            <input
              id={passwordId}
              type="password"
              required
              maxLength={200}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handlePasswordLogin}
              disabled={isPending || !password}
              className={primaryButtonClass}
            >
              {isPending ? t("verifyingLabel") : t("verifyLabelPassword")}
            </button>
            <button type="button" onClick={() => switchMode("code")} className={switchLinkClass}>
              {t("signInWithCode")}
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
