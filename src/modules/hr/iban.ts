// Saudi IBAN validation: "SA" + 2 check digits + 20 digits (2-digit bank code
// + 18-digit account) = 24 characters, verified with the ISO 13616 mod-97
// check. Staff type IBANs with spaces, so we normalize before validating.

const SA_IBAN_RE = /^SA\d{22}$/;

export function normalizeIban(raw: string): string {
  return raw.replace(/[\s-]/g, "").toUpperCase();
}

// ISO 13616: move the first four chars to the end, map letters to 10..35,
// and the resulting number mod 97 must equal 1. Computed in chunks so it
// never exceeds safe integer range.
function mod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const digits = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const digit of digits) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder;
}

export function isValidSaudiIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  return SA_IBAN_RE.test(iban) && mod97(iban) === 1;
}

/** Groups a normalized IBAN in fours for display: "SA03 8000 0000 ...". */
export function formatIban(iban: string): string {
  return normalizeIban(iban).replace(/(.{4})/g, "$1 ").trim();
}
