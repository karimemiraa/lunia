// Rule-based understanding: keyword/synonym/regex extraction over Arabic and
// English (including Saudi spellings and typos). This is the default engine
// and must stand on its own; a model adapter (gemini.ts) only ever adds to it.

import { asciiDigits, normalizeText, TextMatcher } from "../normalize";
import { extractPhone } from "../phone";
import {
  AREAS,
  CONCERNS,
  CONTRAINDICATIONS,
  EVENTS,
  GOALS,
  INTENTS,
  SKIN_TYPES,
  type Area,
  type Concern,
  type Contraindication,
  type Understanding,
} from "../types";
import {
  AREA_LEXICON,
  CONCERN_LEXICON,
  CONTRA_LEXICON,
  EVENT_LEXICON,
  GOAL_LEXICON,
  INTENT_LEXICON,
  NEGATIONS,
  NONE_OF_THESE,
  SKIN_TYPE_LEXICON,
  TREATMENT_LEXICON,
  TRIED_NOTHING,
  TRIED_VERBS,
} from "./lexicon";

/** What the conversation is currently waiting for, to bias extraction. */
export type Expecting = "concern" | "duration" | "tried" | "goal" | "skin_type" | "safety" | "name" | "phone" | "code" | "free";

export interface UnderstandContext {
  expecting?: Expecting;
}

export interface NluEngine {
  readonly id: string;
  understand(text: string, ctx?: UnderstandContext): Promise<Understanding>;
}

// --- Time expressions ---------------------------------------------------

const NUMBER_WORDS: Record<string, number> = Object.fromEntries(
  (
    [
      ["واحد", 1], ["وحده", 1], ["a", 1], ["an", 1], ["one", 1],
      ["اثنين", 2], ["ثنتين", 2], ["two", 2], ["couple", 2], ["كم", 3], ["few", 3], ["several", 4],
      ["ثلاث", 3], ["ثلاثه", 3], ["three", 3], ["اربع", 4], ["اربعه", 4], ["four", 4],
      ["خمس", 5], ["خمسه", 5], ["five", 5], ["ست", 6], ["سته", 6], ["six", 6],
      ["سبع", 7], ["سبعه", 7], ["seven", 7], ["ثمان", 8], ["ثمانيه", 8], ["eight", 8],
      ["تسع", 9], ["تسعه", 9], ["nine", 9], ["عشر", 10], ["عشره", 10], ["ten", 10],
    ] as [string, number][]
  ).map(([w, n]) => [normalizeText(w), n]),
);

// unit -> months, with singular/dual/plural spellings.
const UNITS: [RegExp, number, number][] = [
  // [pattern, months per unit, implied count when the word is a dual form]
  [/^(?:سنتين|سنتان)$/, 12, 2],
  [/^(?:شهرين|شهران)$/, 1, 2],
  [/^(?:اسبوعين|اسبوعان)$/, 12 / 52, 2],
  [/^(?:يومين)$/, 1 / 30, 2],
  [/^(?:سنه|سنوات|سنين|عام|اعوام|year|years|yr|yrs)$/, 12, 1],
  [/^(?:شهر|اشهر|شهور|month|months|mo)$/, 1, 1],
  [/^(?:اسبوع|اسابيع|week|weeks|wk|wks)$/, 12 / 52, 1],
  [/^(?:يوم|ايام|day|days)$/, 1 / 30, 1],
];

function unitOf(token: string): { months: number; dual: number } | null {
  const bare = token.replace(/^(?:ال|لل|ب|و)/, "");
  for (const [re, months, dual] of UNITS) {
    if (re.test(token) || re.test(bare)) return { months, dual };
  }
  return null;
}

const TIMELINE_MARKERS = ["بعد", "خلال", "في", "in", "within", "next", "الجاي", "القادم", "الجايه", "القادمه", "coming", "by"].map(normalizeText);
const DURATION_MARKERS = ["من", "صار", "صارلي", "لي", "له", "لها", "قبل", "for", "since", "ago", "past", "last", "over"].map(normalizeText);
const EVENT_WORDS = new Set(Object.values(EVENT_LEXICON).flat().filter((w) => !w.includes(" ")));

interface TimeSpan {
  months: number;
  kind: "duration" | "timeline";
}

function parseSpans(m: TextMatcher, expecting: Expecting | undefined): TimeSpan[] {
  const spans: TimeSpan[] = [];
  const t = m.tokens;
  for (let i = 0; i < t.length; i++) {
    const unit = unitOf(t[i]!);
    if (!unit) continue;
    let count = unit.dual;
    let start = i;
    const prev = t[i - 1];
    if (prev !== undefined) {
      if (/^\d+(?:\.\d+)?$/.test(prev)) {
        count = Number(prev);
        start = i - 1;
      } else if (NUMBER_WORDS[prev] !== undefined) {
        count = NUMBER_WORDS[prev]!;
        start = i - 1;
      }
    }
    // Look back a few tokens for what kind of span this is.
    // The nearest marker before the number decides ("in the last year" is a
    // duration, "in 3 weeks" a timeline); an event word nearby ("زواجي بعد
    // شهرين", "قبل زواجي بشهرين") always makes it a timeline.
    const context = t.slice(Math.max(0, start - 3), start);
    const after = t[i + 1];
    let kind: TimeSpan["kind"] | null = null;
    if (after === "ago") kind = "duration";
    else if (after === "الجاي" || after === "القادم" || after === "الجايه") kind = "timeline";
    else if (context.some((w) => EVENT_WORDS.has(w.replace(/^(?:ال|و|ب)/, "")) || EVENT_WORDS.has(w))) kind = "timeline";
    else {
      for (let j = context.length - 1; j >= 0 && !kind; j--) {
        if (DURATION_MARKERS.includes(context[j]!)) kind = "duration";
        else if (TIMELINE_MARKERS.includes(context[j]!)) kind = "timeline";
      }
    }
    kind ??= expecting === "goal" ? "timeline" : "duration";
    spans.push({ months: Math.round(count * unit.months * 100) / 100, kind });
  }
  // Fuzzy spans without a number.
  if (m.firstOf(["من زمان", "من زمان طويل", "من سنين", "long time", "a long time", "for ages", "for years"].map(normalizeText))) {
    spans.push({ months: 24, kind: "duration" });
  }
  if (m.firstOf(["من صغري", "من وانا صغيره", "من المراهقه", "since i was a teen", "since my teens", "since teenage", "since i was young"].map(normalizeText))) {
    spans.push({ months: 60, kind: "duration" });
  }
  if (m.firstOf(["جديد", "من فتره بسيطه", "من قريب", "توه", "recently", "recent", "new", "just started"].map(normalizeText)) && expecting === "duration") {
    spans.push({ months: 1, kind: "duration" });
  }
  return spans;
}

// --- Entity helpers -----------------------------------------------------

function collect<K extends string>(m: TextMatcher, keys: readonly K[], lex: Record<K, string[]>): { key: K; index: number }[] {
  const out: { key: K; index: number }[] = [];
  for (const key of keys) {
    const hit = m.firstOf(lex[key]);
    if (hit) out.push({ key, index: hit.index });
  }
  return out;
}

const NAME_PREFIXES = ["اسمي", "انا اسمي", "معك", "my name is", "my name's", "name is", "this is", "call me"].map(normalizeText);
const NAME_STOPWORDS = new Set(
  ["ابي", "ابغى", "احجز", "حجز", "موعد", "لا", "نعم", "ايه", "yes", "no", "book", "hi", "hello", "مرحبا", "هلا", "شكرا", "thanks", "skip", "تخطي"].map(
    normalizeText,
  ),
);

/** A plausible person name from `raw` (letters only, 1-4 words), or null. */
export function cleanPersonName(raw: string): string | null {
  const text = raw.replace(/[^\p{L}\s'.-]/gu, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length > 60) return null;
  const words = text.split(" ");
  if (words.length > 4) return null;
  if (words.some((w) => NAME_STOPWORDS.has(normalizeText(w)))) return null;
  return text;
}

// Words that end a name ("my name is Layla and ...", "اسمي نورة ورقمي ...").
const NAME_BREAKS = new Set(
  ["and", "call", "my", "number", "phone", "i", "from", "please", "و", "رقمي", "جوالي", "ابي", "ابغى", "من", "عمري", "لو"].map(normalizeText),
);

function extractName(raw: string, m: TextMatcher, expecting: Expecting | undefined): string | undefined {
  // Keep punctuation as its own token so a comma ends the name.
  const tokens = raw.replace(/([,،.؛;!?؟:()])/g, " $1 ").split(/\s+/).filter(Boolean);
  for (const prefix of NAME_PREFIXES) {
    const n = prefix.split(" ").length;
    for (let i = 0; i + n <= tokens.length; i++) {
      if (normalizeText(tokens.slice(i, i + n).join(" ")) !== prefix) continue;
      const words: string[] = [];
      for (const token of tokens.slice(i + n)) {
        if (!/^[\p{L}'-]+$/u.test(token) || NAME_BREAKS.has(normalizeText(token)) || normalizeText(token).startsWith("ورقم")) break;
        words.push(token);
        if (words.length === 3) break;
      }
      const candidate = cleanPersonName(words.join(" "));
      if (candidate) return candidate;
    }
  }
  if (expecting === "name") {
    const phoneless = raw.replace(/[\d+٠-٩]/g, " ");
    return cleanPersonName(phoneless) ?? undefined;
  }
  void m;
  return undefined;
}

function extractCode(raw: string, expecting: Expecting | undefined): string | undefined {
  const digits = asciiDigits(raw);
  const spaced = expecting === "code" ? digits.replace(/[\s-]/g, "") : digits;
  const match = /(?:^|\D)(\d{6})(?!\d)/.exec(spaced);
  return match ? match[1] : undefined;
}

// A concern matched only because of the allergy phrase ("حساسيه من") is not
// sensitive skin; and a post-surgery swelling is not a skin concern.
function pruneConcerns(concerns: { key: Concern; index: number }[], contraAt: Map<Contraindication, number>): Concern[] {
  const allergyAt = contraAt.get("allergies");
  return concerns
    .filter((c) => !(c.key === "sensitivity" && allergyAt !== undefined && c.index === allergyAt))
    .map((c) => c.key);
}

function inferAreas(concerns: Concern[], explicit: Area[]): Area[] {
  const areas = new Set<Area>(explicit);
  for (const c of concerns) {
    if (c === "hair_loss" || c === "dandruff" || c === "hair_damage") areas.add("scalp");
    else if (c === "post_surgery") areas.add("body");
    else areas.add("face");
  }
  return [...areas];
}

/** Pure, synchronous extraction — the heart of the rule-based engine. */
export function understandText(raw: string, ctx: UnderstandContext = {}): Understanding {
  const m = new TextMatcher(raw);
  const expecting = ctx.expecting;

  // Contraindications, honoring negation ("مو حامل", "not pregnant").
  const contraAt = new Map<Contraindication, number>();
  for (const { key, index } of collect(m, CONTRAINDICATIONS, CONTRA_LEXICON)) {
    if (!m.negatedAt(index, NEGATIONS)) contraAt.set(key, index);
  }
  // A procedure mentioned with a recent time ("سويت ليزر قبل اسبوع").
  const procedure = m.firstOf([...TREATMENT_LEXICON.laser, ...TREATMENT_LEXICON.botox, ...TREATMENT_LEXICON.filler, ...TREATMENT_LEXICON.peel]);
  const recent = m.firstOf(["امس", "قبل يومين", "قبل كم يوم", "قبل اسبوع", "الاسبوع الماضي", "هالاسبوع", "yesterday", "last week", "this week", "few days ago", "days ago"].map(normalizeText));
  if (procedure && recent && !contraAt.has("recent_procedure")) contraAt.set("recent_procedure", procedure.index);

  const concernHits = collect(m, CONCERNS, CONCERN_LEXICON);
  const concerns = pruneConcerns(concernHits, contraAt);
  const explicitAreas = collect(m, AREAS, AREA_LEXICON).map((a) => a.key);

  // Skin type only when the message is about skin type (or we asked for it),
  // so "dry scalp" or "بشره حساسه" in passing don't overwrite a real answer.
  let skinType: Understanding["skinType"];
  const aboutSkin = expecting === "skin_type" || m.firstOf(["بشرتي", "بشرتي نوعها", "نوع بشرتي", "my skin", "skin type", "skin is"].map(normalizeText));
  if (aboutSkin) {
    const hit = collect(m, SKIN_TYPES, SKIN_TYPE_LEXICON).sort((a, b) => a.index - b.index)[0];
    if (hit) skinType = hit.key;
  }

  const goals = collect(m, GOALS, GOAL_LEXICON).map((g) => g.key);
  const event = collect(m, EVENTS, EVENT_LEXICON).sort((a, b) => a.index - b.index)[0]?.key;

  const spans = parseSpans(m, expecting);
  const duration = spans.find((s) => s.kind === "duration");
  const timeline = spans.find((s) => s.kind === "timeline");

  const triedContext = expecting === "tried" || !!m.firstOf(TRIED_VERBS);
  const previousTreatments = triedContext
    ? Object.entries(TREATMENT_LEXICON)
        .filter(([, patterns]) => m.firstOf(patterns))
        .map(([label]) => label)
    : [];
  const triedNothing = !!m.firstOf(TRIED_NOTHING) && previousTreatments.length === 0;

  const noContraindications =
    contraAt.size === 0 && (expecting === "safety" ? !!m.firstOf(NONE_OF_THESE) : !!m.firstOf(["مو حامل", "not pregnant", "لست حامل"].map(normalizeText)));

  // Intents. Short "yes"/"no" words only count when the message is short, so
  // "لا" inside a sentence doesn't read as a refusal.
  const intents = INTENTS.filter((intent) => {
    if ((intent === "yes" || intent === "no") && m.tokens.length > 4) return false;
    return !!m.firstOf(INTENT_LEXICON[intent]);
  });

  const phone = extractPhone(raw) ?? undefined;
  const code = expecting === "code" || expecting === "free" || !phone ? extractCode(raw, expecting) : undefined;

  return {
    intents,
    concerns,
    areas: inferAreas(concerns, explicitAreas),
    skinType,
    goals,
    event,
    durationMonths: duration?.months,
    timelineWeeks: timeline ? Math.max(1, Math.round(timeline.months * 4.33)) : undefined,
    previousTreatments,
    triedNothing: triedNothing || undefined,
    contraindications: [...contraAt.keys()],
    noContraindications: noContraindications || undefined,
    phone,
    name: extractName(raw, m, expecting),
    code: phone && expecting !== "code" ? undefined : code,
  };
}

export const ruleEngine: NluEngine = {
  id: "rules",
  async understand(text, ctx) {
    return understandText(text, ctx);
  },
};

/** Union of two understandings (rules first, then a model's additions). */
export function mergeUnderstanding(base: Understanding, extra: Partial<Understanding>): Understanding {
  const union = <T>(a: T[], b: T[] | undefined) => [...new Set([...a, ...(b ?? [])])];
  return {
    intents: union(base.intents, extra.intents),
    concerns: union(base.concerns, extra.concerns),
    areas: union(base.areas, extra.areas),
    skinType: base.skinType ?? extra.skinType,
    goals: union(base.goals, extra.goals),
    event: base.event ?? extra.event,
    durationMonths: base.durationMonths ?? extra.durationMonths,
    timelineWeeks: base.timelineWeeks ?? extra.timelineWeeks,
    previousTreatments: union(base.previousTreatments, extra.previousTreatments),
    triedNothing: base.triedNothing ?? extra.triedNothing,
    contraindications: union(base.contraindications, extra.contraindications),
    noContraindications: base.contraindications.length || extra.contraindications?.length ? undefined : base.noContraindications ?? extra.noContraindications,
    phone: base.phone ?? extra.phone,
    name: base.name ?? extra.name,
    code: base.code ?? extra.code,
  };
}
