"use client";

import { useActionState, useId } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { submitInquiry, type ContactFormState } from "./actions";

const initialContactFormState: ContactFormState = { status: "idle" };

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]";

const inputClass = `w-full rounded-xl border border-[var(--color-ink)]/15 bg-[var(--color-page)] px-4 py-3 text-base text-[var(--color-ink)] placeholder:text-[var(--color-ink)]/40 transition-colors focus:border-[var(--color-teal)] ${focusRingClass}`;

const labelClass = "text-sm font-medium text-[var(--color-ink)]";

// The public inquiry form: name, phone, message (required) + email
// (optional). A client component so useActionState can drive submit/pending
// state and surface success/error copy without a full page reload; the
// actual persistence happens server-side in ./actions (no auth required —
// this is a public form — and no external send yet, that's a later stage).
export function ContactForm() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("contact.form");
  const [state, formAction, pending] = useActionState(submitInquiry, initialContactFormState);

  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const messageId = useId();

  return (
    <form
      action={formAction}
      className="flex flex-col gap-6 rounded-2xl border border-[var(--color-ink)]/10 bg-[var(--color-page)] p-6 sm:p-8"
      noValidate
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">{t("heading")}</h2>
        <p className="text-sm leading-relaxed text-[var(--color-ink)]/65">{t("intro")}</p>
      </div>

      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="sourcePage" value={pathname ?? ""} />

      <div className="flex flex-col gap-2">
        <label htmlFor={nameId} className={labelClass}>
          {t("nameLabel")}
        </label>
        <input id={nameId} name="name" type="text" required maxLength={200} autoComplete="name" className={inputClass} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={phoneId} className={labelClass}>
          {t("phoneLabel")}
        </label>
        <input id={phoneId} name="phone" type="tel" required maxLength={40} autoComplete="tel" className={inputClass} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={emailId} className={labelClass}>
          {t("emailLabel")}
        </label>
        <input id={emailId} name="email" type="email" maxLength={200} autoComplete="email" className={inputClass} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={messageId} className={labelClass}>
          {t("messageLabel")}
        </label>
        <textarea id={messageId} name="message" required maxLength={4000} rows={5} className={inputClass} />
      </div>

      <p className="text-xs text-[var(--color-ink)]/45">{t("requiredNote")}</p>

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={pending}
          className={`inline-flex w-fit items-center justify-center whitespace-nowrap rounded-full bg-[var(--color-teal)] px-8 py-3.5 text-sm font-medium tracking-wide text-[var(--color-ink)] transition-colors hover:bg-[var(--color-canopy)] disabled:opacity-60 ${focusRingClass}`}
        >
          {pending ? t("submittingLabel") : t("submitLabel")}
        </button>

        {state.status === "success" && (
          <p role="status" className="text-sm font-medium text-[var(--color-canopy)]">
            {state.message}
          </p>
        )}
        {state.status === "error" && (
          <p role="alert" className="text-sm font-medium text-red-700">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
