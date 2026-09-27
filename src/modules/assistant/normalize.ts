// Text normalization for the rule-based assistant. Arabic is written many ways
// in chat (hamza forms, taa marbuta vs haa, diacritics, stretched letters,
// Arabic-Indic digits), so every input and every lexicon pattern goes through
// the same folding before matching.

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;
// Zero-width / bidi control characters people paste in (and abusers inject).
const INVISIBLES = /[​-‏‪-‮⁦-⁩﻿]/g;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Converts Arabic-Indic (٠-٩) and Persian (۰-۹) digits to ASCII. */
export function asciiDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Cleans raw visitor input for storage/display: strips control and invisible
 * characters, collapses whitespace and caps the length. It stays plain text
 * (React escapes it on render), so no HTML ever reaches the page.
 */
export function sanitizeInput(raw: string, maxLength: number): string {
  return raw.replace(CONTROL, " ").replace(INVISIBLES, "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/** Folds text into the matching form used by the lexicon. */
export function normalizeText(raw: string): string {
  let text = asciiDigits(raw).toLowerCase();
  text = text.replace(DIACRITICS, "").replace(TATWEEL, "").replace(INVISIBLES, "");
  text = text
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[’`]/g, "'");
  // Punctuation (Arabic and Latin) becomes a word break; keep digits, + and '.
  text = text.replace(/[^\p{L}\p{N}+'\s]/gu, " ");
  // Stretched letters ("حبوووب", "soooo") collapse to one.
  text = text.replace(/(\p{L})\1{2,}/gu, "$1");
  return text.replace(/\s+/g, " ").trim();
}

const ARABIC_PREFIXES = ["وبال", "وال", "بال", "فال", "كال", "لل", "ال", "و", "ف", "ب", "ل"];

/** Variants of a token with common Arabic clitic prefixes removed. */
export function tokenVariants(token: string): string[] {
  const out = [token];
  if (!/[؀-ۿ]/.test(token)) return out;
  for (const prefix of ARABIC_PREFIXES) {
    if (token.startsWith(prefix) && token.length - prefix.length >= 2) out.push(token.slice(prefix.length));
  }
  return out;
}

/** Damerau-Levenshtein (optimal string alignment) distance, capped for speed. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

const isArabic = (s: string) => /[؀-ۿ]/.test(s);

// How many typos a single-word pattern tolerates. Short words get none (too
// many false friends: "dry"/"day", "حب"/"حبه"); Arabic is denser than Latin,
// so it earns tolerance a little later.
function allowedTypos(pattern: string): number {
  const len = pattern.length;
  if (isArabic(pattern)) return len >= 5 ? 1 : 0;
  if (len >= 9) return 2;
  if (len >= 6) return 1;
  return 0;
}

/**
 * A matcher over one normalized message. Single-word patterns match a token
 * exactly, after stripping Arabic prefixes, as a stem (pattern >= 4 chars
 * that the token starts with, covering suffixes like "حبوبي"/"pimples"), or
 * within a small typo budget. Multi-word patterns match as a phrase.
 */
export class TextMatcher {
  readonly text: string;
  readonly tokens: string[];
  private readonly variants: string[][];
  private readonly padded: string;

  constructor(raw: string) {
    this.text = normalizeText(raw);
    this.tokens = this.text ? this.text.split(" ") : [];
    this.variants = this.tokens.map(tokenVariants);
    this.padded = ` ${this.text} `;
  }

  /** Index of the first token matching `pattern` (already normalized), or -1. */
  indexOf(pattern: string): number {
    if (pattern.includes(" ")) {
      const at = this.padded.indexOf(` ${pattern}`);
      if (at < 0) {
        // Allow a clitic prefix on the phrase's first word ("والحب الشباب" style).
        for (let i = 0; i < this.tokens.length; i++) {
          const rest = this.tokens.slice(i).join(" ");
          for (const v of this.variants[i]!) {
            if (`${v}${rest.slice(this.tokens[i]!.length)}`.startsWith(pattern)) return i;
          }
        }
        return -1;
      }
      return this.padded.slice(0, at).split(" ").filter(Boolean).length;
    }
    const typos = allowedTypos(pattern);
    for (let i = 0; i < this.tokens.length; i++) {
      for (const v of this.variants[i]!) {
        if (v === pattern) return i;
        if (pattern.length >= 4 && v.startsWith(pattern) && v.length - pattern.length <= 4) return i;
        if (typos > 0 && Math.abs(v.length - pattern.length) <= typos && editDistance(v, pattern, typos) <= typos) {
          return i;
        }
      }
    }
    return -1;
  }

  has(pattern: string): boolean {
    return this.indexOf(pattern) >= 0;
  }

  /** First pattern (in order) that matches, or null. */
  firstOf(patterns: readonly string[]): { pattern: string; index: number } | null {
    for (const pattern of patterns) {
      const index = this.indexOf(pattern);
      if (index >= 0) return { pattern, index };
    }
    return null;
  }

  /** Whether a negation word sits within `window` tokens before `index`. */
  negatedAt(index: number, negations: readonly string[], window = 2): boolean {
    for (let i = Math.max(0, index - window); i < index; i++) {
      if (negations.includes(this.tokens[i]!)) return true;
    }
    return false;
  }
}
