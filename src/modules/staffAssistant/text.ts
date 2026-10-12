// Text normalisation + fuzzy term matching shared by the navigation, guide
// and intent matchers. Handles English and Arabic (letter-variant folding,
// diacritics, the definite article) so "الفواتير", "فواتير" and "invoices"
// all reach the same place.

const AR_DIACRITICS = /[ً-ْٰـ]/g; // harakat + tatweel

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(AR_DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[^\p{L}\p{N}\s/-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  "the", "a", "an", "to", "me", "my", "please", "i", "we", "you", "can", "could", "would", "is", "are", "of", "for", "in", "on", "and",
  "page", "screen", "section", "show", "open", "go", "take", "navigate", "where", "find", "see", "view", "want", "need", "let", "us",
  // Question words: the how-to/number intent is detected separately, so they only dilute matches.
  "how", "do", "does", "did", "what", "which", "should", "it", "this", "that",
  "من", "الى", "إلى", "الي", "في", "على", "عن", "لي", "ان", "هل", "اين", "افتح", "اذهب", "اعرض", "صفحه", "ممكن", "اريد", "لو",
  "كيف", "طريقه", "ازاي", "شلون", "ابي", "ابغى", "ابغي", "عايز", "ما", "هو", "هي", "انا",
]);

/** Meaningful tokens; strips the Arabic definite article "ال" so forms match. */
export function tokens(text: string): string[] {
  return normalize(text)
    .split(/[\s/-]+/)
    .filter(Boolean)
    .map((t) => (/^ال[\p{L}]{2,}/u.test(t) ? t.slice(2) : t))
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function tokenMatches(q: string, term: string): boolean {
  if (q === term) return true;
  // Prefix match for plurals/stems: "invoice" ~ "invoices", "فاتور" ~ "فواتير" handled by stems list.
  if (q.length >= 4 && term.length >= 4 && (term.startsWith(q) || q.startsWith(term))) return true;
  return false;
}

/**
 * How well a query matches a set of phrases (0..1.25): the share of the query's
 * tokens found among the phrases' tokens, plus up to 0.25 for a full-phrase hit.
 */
export function matchScore(query: string, phrases: string[]): number {
  const q = tokens(query);
  if (q.length === 0) return 0;
  const termSet = phrases.flatMap((p) => tokens(p));
  if (termSet.length === 0) return 0;
  let hit = 0;
  for (const t of q) if (termSet.some((term) => tokenMatches(t, term))) hit += 1;
  let score = hit / q.length;
  const nq = normalize(query);
  // Bonus for a whole phrase found in the query, scaled by how much of the query
  // it covers, so "stock take" ranks Stock-take above Products & stock ("stock").
  let longest = 0;
  for (const p of phrases) {
    const np = normalize(p);
    if (np.length > 2 && nq.includes(np)) longest = Math.max(longest, np.length);
  }
  if (longest) score += 0.25 * Math.min(1, longest / nq.length);
  return score;
}

export function hasArabic(text: string): boolean {
  return /[؀-ۿ]/.test(text);
}
