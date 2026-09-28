// Small shared helpers for the public-site forms (contact, gift card, booking):
// one inline error presentation and the two client-side format checks. Server
// actions still validate for real (zod); these only catch slips early.

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

// Saudi mobiles (05x / +9665x / 9665x) and any international number with
// 8–15 digits — lenient on spaces, dashes and parentheses.
export function isValidPhone(value: string): boolean {
  const digits = value.replace(/[\s\-().]/g, "");
  return /^\+?\d{8,15}$/.test(digits);
}

// Either a phone number or an email address (the booking/waitlist identifier).
export function isValidIdentifier(value: string): boolean {
  const v = value.trim();
  return v.includes("@") ? isValidEmail(v) : isValidPhone(v);
}

interface FieldErrorProps {
  id: string;
  message?: string | null;
}

// Inline field error: rendered under its input, referenced by aria-describedby,
// and announced politely as it appears. Renders nothing when there is no error.
export function FieldError({ id, message }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="lx-error">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
        <circle cx="8" cy="8" r="6.25" />
        <path d="M8 5v3.5M8 11h.01" />
      </svg>
      <span>{message}</span>
    </p>
  );
}
