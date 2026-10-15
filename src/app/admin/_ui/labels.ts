// Class strings shared by server and client primitives (kept out of the
// "use client" modules so server components can import them as plain values).
export const labelTextClass = "text-xs font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/65";
export const helpTextClass = "text-xs leading-relaxed text-[var(--color-ink)]/55";
export const errorTextClass = "text-xs font-medium text-[var(--status-danger-ink)]";
/** 44px tall, 16px type on touch (see tokens.css), 14px on desktop. */
export const inputClass = "lunia-input min-h-11 text-base md:text-sm";
export const invalidInputClass = "border-[#d92d20] focus:border-[#d92d20]";

/**
 * Translates a status label. A few English words mean something else as a
 * status ("Open" the state vs "Open" the button), so "<label> (status)" is
 * looked up first, then the plain label.
 */
export function translateStatus(label: string, t: (text: string) => string): string {
  const key = `${label} (status)`;
  const special = t(key);
  return special !== key ? special : t(label);
}
