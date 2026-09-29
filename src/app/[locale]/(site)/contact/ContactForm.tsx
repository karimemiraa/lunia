"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { submitInquiry, type ContactFormState } from "./actions";
import { FieldError, isValidEmail, isValidPhone } from "@/components/site/forms";

const initialContactFormState: ContactFormState = { status: "idle" };

type FieldName = "name" | "phone" | "email" | "message";
type Errors = Partial<Record<FieldName, string>>;

// The public inquiry form: name, phone, message (required) + email
// (optional). A client component so useActionState can drive submit/pending
// state and surface success/error copy without a full page reload; the
// actual persistence happens server-side in ./actions. Validation runs on
// blur (and again on submit) so mistakes are flagged next to the field
// before anything is sent; a honeypot field quietly drops bot submissions.
export function ContactForm() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("contact.form");
  const [state, formAction, pending] = useActionState(submitInquiry, initialContactFormState);
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const successRef = useRef<HTMLDivElement>(null);

  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const messageId = useId();
  const ids: Record<FieldName, string> = { name: nameId, phone: phoneId, email: emailId, message: messageId };

  function validateField(field: FieldName, value: string): string | undefined {
    const v = value.trim();
    if (field === "name") return v.length >= 2 ? undefined : t("errors.name");
    if (field === "phone") return isValidPhone(v) ? undefined : t("errors.phone");
    if (field === "email") return !v || isValidEmail(v) ? undefined : t("errors.email");
    return v.length >= 10 ? undefined : t("errors.message");
  }

  function onBlur(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const field = e.target.name as FieldName;
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors((prev) => ({ ...prev, [field]: validateField(field, e.target.value) }));
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const field = e.target.name as FieldName;
    // Clear an error as soon as the visitor fixes it; don't nag while typing.
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: validateField(field, e.target.value) }));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const next: Errors = {};
    for (const field of ["name", "phone", "email", "message"] as const) {
      const el = form.elements.namedItem(field) as HTMLInputElement | HTMLTextAreaElement | null;
      const err = validateField(field, el?.value ?? "");
      if (err) next[field] = err;
    }
    setTouched({ name: true, phone: true, email: true, message: true });
    setErrors(next);
    const first = (Object.keys(next) as FieldName[])[0];
    if (first) {
      e.preventDefault();
      (form.elements.namedItem(first) as HTMLElement | null)?.focus();
    }
  }

  // Move focus to the confirmation so screen readers announce it and the
  // visitor sees the next step without hunting for it.
  useEffect(() => {
    if (state.status === "success") successRef.current?.focus();
  }, [state.status]);

  if (state.status === "success") {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="lx-surface flex flex-col items-center gap-5 rounded-[28px] p-8 text-center outline-none sm:p-10"
        data-testid="contact-success"
      >
        <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-teal)]/30 text-[var(--color-teal-ink)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        <h2 className="lx-display text-[clamp(1.9rem,1.5rem+1vw,2.5rem)] text-[var(--color-ink)]">{t("successHeading")}</h2>
        <p className="max-w-md text-[0.975rem] leading-relaxed text-[var(--color-ink)]/75">{state.message}</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link href={`/${locale}/book`} className="lx-pill">
            {t("successNext")}
          </Link>
          <Link href={`/${locale}`} className="lx-pill lx-pill-ghost">
            {t("backHome")}
          </Link>
        </div>
      </div>
    );
  }

  const invalid = (field: FieldName) => Boolean(touched[field] && errors[field]);

  return (
    <form action={formAction} onSubmit={onSubmit} className="lx-surface relative flex flex-col gap-6 rounded-[28px] p-7 sm:p-10" noValidate>
      <div className="flex flex-col gap-1">
        <h2 className="lx-display text-[clamp(1.9rem,1.5rem+1vw,2.5rem)] text-[var(--color-ink)]">{t("heading")}</h2>
        <p className="text-sm leading-relaxed text-[var(--color-ink)]/75">{t("intro")}</p>
      </div>

      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="sourcePage" value={pathname ?? ""} />
      {/* Honeypot: humans never see it; bots fill it and the server drops the submission. */}
      <div className="lx-hp" aria-hidden="true">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.name} className="lx-label">
          {t("nameLabel")} <span aria-hidden="true">*</span>
        </label>
        <input
          id={ids.name}
          name="name"
          type="text"
          required
          maxLength={200}
          autoComplete="name"
          onBlur={onBlur}
          onChange={onChange}
          aria-invalid={invalid("name") || undefined}
          aria-describedby={invalid("name") ? `${ids.name}-err` : undefined}
          className="lx-input"
        />
        <FieldError id={`${ids.name}-err`} message={invalid("name") ? errors.name : undefined} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.phone} className="lx-label">
          {t("phoneLabel")} <span aria-hidden="true">*</span>
        </label>
        <input
          id={ids.phone}
          name="phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          required
          maxLength={40}
          autoComplete="tel"
          placeholder="05x xxx xxxx"
          onBlur={onBlur}
          onChange={onChange}
          aria-invalid={invalid("phone") || undefined}
          aria-describedby={`${ids.phone}-help${invalid("phone") ? ` ${ids.phone}-err` : ""}`}
          className="lx-input text-start"
        />
        <p id={`${ids.phone}-help`} className="lx-help">
          {t("phoneHelp")}
        </p>
        <FieldError id={`${ids.phone}-err`} message={invalid("phone") ? errors.phone : undefined} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.email} className="lx-label">
          {t("emailLabel")}
        </label>
        <input
          id={ids.email}
          name="email"
          type="email"
          inputMode="email"
          dir="ltr"
          maxLength={200}
          autoComplete="email"
          onBlur={onBlur}
          onChange={onChange}
          aria-invalid={invalid("email") || undefined}
          aria-describedby={invalid("email") ? `${ids.email}-err` : undefined}
          className="lx-input text-start"
        />
        <FieldError id={`${ids.email}-err`} message={invalid("email") ? errors.email : undefined} />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={ids.message} className="lx-label">
          {t("messageLabel")} <span aria-hidden="true">*</span>
        </label>
        <textarea
          id={ids.message}
          name="message"
          required
          maxLength={4000}
          rows={5}
          onBlur={onBlur}
          onChange={onChange}
          aria-invalid={invalid("message") || undefined}
          aria-describedby={`${ids.message}-help${invalid("message") ? ` ${ids.message}-err` : ""}`}
          className="lx-input resize-y"
        />
        <p id={`${ids.message}-help`} className="lx-help">
          {t("messageHelp")}
        </p>
        <FieldError id={`${ids.message}-err`} message={invalid("message") ? errors.message : undefined} />
      </div>

      <p className="lx-help">{t("requiredNote")}</p>

      <div className="flex flex-col gap-3">
        <button type="submit" disabled={pending} aria-busy={pending || undefined} className="lx-pill w-fit">
          {pending ? t("submittingLabel") : t("submitLabel")}
        </button>

        {state.status === "error" && (
          <p role="alert" className="lx-notice lx-notice-error">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
