"use client";

// The signed-in client's sign-in & security settings: their display name (used
// to personalize emails) and an optional login password (an alternative to the
// email/phone verification code). Both actions re-derive the caller's identity
// from the session cookie — this component never sends an id.

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { updateMyName, setMyPassword } from "./actions";

interface SecurityPanelProps {
  locale: "en" | "ar";
  fullName: string;
  hasPassword: boolean;
}

const MIN_PASSWORD = 8;

export function SecurityPanel({ locale, fullName, hasPassword }: SecurityPanelProps) {
  const t = useTranslations("account.security");
  const [namePending, startName] = useTransition();
  const [pwPending, startPw] = useTransition();

  const [name, setName] = useState(fullName);
  const [nameSaved, setNameSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordSet, setPasswordSet] = useState(hasPassword);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  function handleNameSubmit(event: FormEvent) {
    event.preventDefault();
    setNameError(null);
    setNameSaved(false);
    startName(async () => {
      const result = await updateMyName(name, locale);
      if (result.ok) setNameSaved(true);
      else setNameError(result.error);
    });
  }

  function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setPwError(null);
    setPwSaved(false);
    if (password.length < MIN_PASSWORD) {
      setPwError(t("errors.passwordTooShort", { min: MIN_PASSWORD }));
      return;
    }
    if (password !== confirm) {
      setPwError(t("errors.passwordMismatch"));
      return;
    }
    startPw(async () => {
      const result = await setMyPassword(password, locale);
      if (result.ok) {
        setPwSaved(true);
        setPasswordSet(true);
        setPassword("");
        setConfirm("");
      } else {
        setPwError(result.error);
      }
    });
  }

  return (
    <section className="lunia-card flex flex-col gap-6 p-6" data-testid="security-panel">
      <div className="flex flex-col gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">{t("heading")}</h2>
        <p className="text-sm text-[var(--color-ink)]/65">{t("intro")}</p>
      </div>

      {/* Name */}
      <form onSubmit={handleNameSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
            {t("nameLabel")}
          </span>
          <input
            type="text"
            maxLength={120}
            autoComplete="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameSaved(false);
            }}
            className="lunia-input"
            data-testid="security-name"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={namePending} className="lunia-btn lunia-btn-primary w-fit disabled:opacity-60">
            {namePending ? t("savingLabel") : t("nameSaveLabel")}
          </button>
          {nameSaved && !namePending && (
            <p className="text-sm font-medium text-[var(--color-teal)]" data-testid="security-name-saved">
              {t("savedLabel")}
            </p>
          )}
          {nameError && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {nameError}
            </p>
          )}
        </div>
      </form>

      <hr className="border-[var(--color-ink)]/10" />

      {/* Password */}
      <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">{t("passwordHeading")}</h3>
          {passwordSet && (
            <span className="rounded-full bg-[var(--color-teal)]/20 px-2.5 py-0.5 text-xs font-medium text-[var(--color-teal-ink)]">
              {t("passwordSetBadge")}
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--color-ink)]/65">
          {passwordSet ? t("passwordIntroSet") : t("passwordIntroUnset")}
        </p>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
            {t("passwordLabel")}
          </span>
          <input
            type="password"
            maxLength={200}
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setPwSaved(false);
            }}
            className="lunia-input"
            data-testid="security-password"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/60">
            {t("passwordConfirmLabel")}
          </span>
          <input
            type="password"
            maxLength={200}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setPwSaved(false);
            }}
            className="lunia-input"
            data-testid="security-password-confirm"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pwPending || !password || !confirm}
            className="lunia-btn lunia-btn-primary w-fit disabled:opacity-60"
          >
            {pwPending ? t("savingLabel") : t("passwordSaveLabel")}
          </button>
          {pwSaved && !pwPending && (
            <p className="text-sm font-medium text-[var(--color-teal)]" data-testid="security-password-saved">
              {t("savedLabel")}
            </p>
          )}
          {pwError && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {pwError}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
