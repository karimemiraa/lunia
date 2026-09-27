"use client";

// Name + drawn signature + "I agree" for one consent form. Shared by the
// customer's account and the admin desk-signing screen (iPad); labels come
// from the "consents.sign" namespace so the desk screen can switch language
// for the client. The page passes the server action that actually records the
// signature (it re-checks identity/permissions itself).

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SignaturePad } from "./SignaturePad";

export type ConsentSignResult = { ok: true; signatureId: string } | { ok: false; error: string };

interface ConsentSignFormProps {
  defaultName: string;
  submit: (input: { signerName: string; signatureData: string }) => Promise<ConsentSignResult>;
  /** The signed-copy URL is this prefix + the new signature id. */
  signedHrefPrefix: string;
  backHref: string;
  padHeight?: number;
  large?: boolean;
}

export function ConsentSignForm({ defaultName, submit, signedHrefPrefix, backHref, padHeight = 220, large = false }: ConsentSignFormProps) {
  const t = useTranslations("consents.sign");
  const [name, setName] = useState(defaultName);
  const [signature, setSignature] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedId, setSignedId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError(t("errors.nameRequired"));
    if (!signature) return setError(t("errors.signatureRequired"));
    if (!agree) return setError(t("errors.agreeRequired"));
    startTransition(async () => {
      const result = await submit({ signerName: name.trim(), signatureData: signature });
      if (result.ok) setSignedId(result.signatureId);
      else setError(result.error);
    });
  }

  if (signedId) {
    return (
      <div role="status" className="flex flex-col items-start gap-4 rounded-2xl bg-[var(--color-teal)]/12 p-6" data-testid="consent-signed">
        <p className="text-base font-medium text-[var(--color-ink)]">{t("success")}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={`${signedHrefPrefix}${signedId}`} className="inline-flex min-h-11 items-center rounded-full bg-[var(--color-ink)] px-6 text-sm font-medium text-white">
            {t("viewSigned")}
          </Link>
          <Link href={backHref} className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-ink)]/20 px-6 text-sm font-medium text-[var(--color-ink)]">
            {t("back")}
          </Link>
        </div>
      </div>
    );
  }

  const text = large ? "text-base" : "text-sm";
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" data-testid="consent-sign-form">
      <label className="flex flex-col gap-2">
        <span className={`${text} font-medium text-[var(--color-ink)]/80`}>{t("nameLabel")}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={120}
          className="min-h-12 w-full rounded-xl border border-[var(--color-ink)]/15 bg-white px-4 text-base text-[var(--color-ink)] focus:border-[var(--color-teal)] focus:outline-none focus:ring-2 focus:ring-[var(--color-teal)]/30"
        />
      </label>
      <div className="flex flex-col gap-2">
        <span className={`${text} font-medium text-[var(--color-ink)]/80`}>{t("signatureLabel")}</span>
        <SignaturePad onChange={setSignature} clearLabel={t("clear")} hint={t("signatureHint")} height={padHeight} ariaLabel={t("signatureLabel")} />
      </div>
      <label className={`flex min-h-11 items-start gap-3 ${text} text-[var(--color-ink)]/85`}>
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-teal)]" />
        {t("agree")}
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-12 items-center justify-center self-start rounded-full bg-[var(--color-ink)] px-8 text-base font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
