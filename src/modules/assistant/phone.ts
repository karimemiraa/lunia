// Phone parsing for chat input. Saudi mobiles are typed every possible way
// ("055 123 4567", "+966 55...", "00966...", "٠٥٥..."); they all fold to
// E.164 (+9665XXXXXXXX). Other international numbers are accepted as-is with
// a leading "+".

import { asciiDigits } from "./normalize";

const SAUDI_MOBILE = /(?:\+?966|00966|0)?\s*5(?:[\s-]?\d){8}/;
const INTERNATIONAL = /(?:\+|00)[1-9](?:[\s-]?\d){7,14}/;

/** Normalizes one phone string, or returns null when it isn't a usable number. */
export function normalizePhone(raw: string): string | null {
  const text = asciiDigits(raw).trim();
  const digits = text.replace(/[^\d+]/g, "");
  const bare = digits.replace(/^\+/, "").replace(/^00/, "");
  const saudi = /^(?:966|0)?(5\d{8})$/.exec(bare);
  if (saudi) return `+966${saudi[1]}`;
  if ((digits.startsWith("+") || digits.startsWith("00")) && /^[1-9]\d{7,14}$/.test(bare)) return `+${bare}`;
  return null;
}

/** Finds the first phone number inside free text. */
export function extractPhone(raw: string): string | null {
  const text = asciiDigits(raw);
  const match = SAUDI_MOBILE.exec(text) ?? INTERNATIONAL.exec(text);
  return match ? normalizePhone(match[0]) : null;
}

/**
 * Spellings the same Saudi number may already be stored under (the booking
 * wizard keeps whatever the customer typed), so lookups find an existing
 * customer instead of creating a duplicate.
 */
export function phoneVariants(e164: string): string[] {
  const saudi = /^\+966(5\d{8})$/.exec(e164);
  if (!saudi) return [e164];
  const local = saudi[1]!;
  return [e164, `966${local}`, `0${local}`, local, `00966${local}`];
}

/** "+966551234567" -> "055 123 4567" for display. */
export function displayPhone(e164: string): string {
  const saudi = /^\+966(5\d)(\d{3})(\d{4})$/.exec(e164);
  return saudi ? `0${saudi[1]} ${saudi[2]} ${saudi[3]}` : e164;
}
