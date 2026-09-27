// Medical-history questionnaire: answer vocabulary, validation schema,
// contraindication flags and diffing. Pure (no DB access) so the shared intake
// form can import it in the browser; persistence lives in intake.ts.
//
// Contraindication flags are DERIVED from the answers on read (never stored),
// so improving the rules re-flags every existing file. They are prompts for
// the specialist, not medical advice: the admin UI presents them under a
// "for specialist review" heading.

import { z } from "zod";

// --- Answer vocabulary --------------------------------------------------------
// Stable keys are stored in the JSON; labels live in the UI (admin: English
// here, customer: the "health" message namespace).

export const SKIN_TYPES = ["normal", "dry", "oily", "combination", "sensitive", "acneProne", "mature"] as const;
export const CONCERNS = [
  "acne",
  "pigmentation",
  "melasma",
  "aging",
  "sensitivity",
  "redness",
  "scarring",
  "dullness",
  "pores",
  "dryness",
  "hairLoss",
  "postSurgery",
] as const;
export const CONDITIONS = [
  "diabetes",
  "thyroid",
  "autoimmune",
  "pcos",
  "epilepsy",
  "keloid",
  "herpes",
  "hypertension",
  "heart",
  "pacemaker",
  "bleedingDisorder",
  "skinCancer",
  "eczemaPsoriasis",
  "vitiligo",
] as const;
export const MEDICATIONS = [
  "isotretinoin",
  "topicalRetinoids",
  "bloodThinners",
  "photosensitizing",
  "oralSteroids",
  "hormonal",
] as const;
export const PROCEDURES = ["laser", "peel", "fillers", "botox", "microneedling", "surgery", "other"] as const;
export const SUN_EXPOSURE = ["low", "moderate", "high"] as const;
export const HAIR_LOSS_PATTERNS = ["diffuse", "receding", "crown", "widening", "patchy"] as const;
export const HAIR_LOSS_DURATIONS = ["lt6m", "6to12m", "1to3y", "gt3y"] as const;

// English labels for the admin UI and for syncing ClientProfile's free-text
// skinType/skinConcerns (which the older Clinical tab edits as labels).
export const SKIN_TYPE_LABELS: Record<(typeof SKIN_TYPES)[number], string> = {
  normal: "Normal",
  dry: "Dry",
  oily: "Oily",
  combination: "Combination",
  sensitive: "Sensitive",
  acneProne: "Acne-prone",
  mature: "Mature",
};
export const CONCERN_LABELS: Record<(typeof CONCERNS)[number], string> = {
  acne: "Acne",
  pigmentation: "Pigmentation",
  melasma: "Melasma",
  aging: "Fine lines / aging",
  sensitivity: "Sensitivity",
  redness: "Redness",
  scarring: "Scarring",
  dullness: "Dullness",
  pores: "Enlarged pores",
  dryness: "Dryness / dehydration",
  hairLoss: "Hair loss / thinning",
  postSurgery: "Post-surgery recovery",
};
export const CONDITION_LABELS: Record<(typeof CONDITIONS)[number], string> = {
  diabetes: "Diabetes",
  thyroid: "Thyroid disorder",
  autoimmune: "Autoimmune condition",
  pcos: "PCOS",
  epilepsy: "Epilepsy / seizures",
  keloid: "Keloid / raised scar tendency",
  herpes: "Herpes / cold sores",
  hypertension: "High blood pressure",
  heart: "Heart condition",
  pacemaker: "Pacemaker or metal implants",
  bleedingDisorder: "Bleeding / clotting disorder",
  skinCancer: "Skin cancer (current or past)",
  eczemaPsoriasis: "Eczema / psoriasis",
  vitiligo: "Vitiligo",
};
export const MEDICATION_LABELS: Record<(typeof MEDICATIONS)[number], string> = {
  isotretinoin: "Isotretinoin (Roaccutane)",
  topicalRetinoids: "Topical retinoids (retinol, tretinoin, adapalene)",
  bloodThinners: "Blood thinners (aspirin, warfarin...)",
  photosensitizing: "Photosensitizing medication (some antibiotics, St John's wort...)",
  oralSteroids: "Oral steroids",
  hormonal: "Hormonal therapy / contraceptives",
};
export const PROCEDURE_LABELS: Record<(typeof PROCEDURES)[number], string> = {
  laser: "Laser / IPL",
  peel: "Chemical peel",
  fillers: "Fillers",
  botox: "Botox",
  microneedling: "Microneedling",
  surgery: "Surgery",
  other: "Other",
};

const dateISO = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .or(z.literal(""));
const text = (max: number) => z.string().trim().max(max).default("");

export const intakeAnswersSchema = z.object({
  skinType: z.enum(SKIN_TYPES).or(z.literal("")).default(""),
  concerns: z.array(z.enum(CONCERNS)).max(CONCERNS.length).default([]),
  goals: text(1000),
  conditions: z.array(z.enum(CONDITIONS)).max(CONDITIONS.length).default([]),
  conditionsOther: text(500),
  medications: z.array(z.enum(MEDICATIONS)).max(MEDICATIONS.length).default([]),
  /** Last isotretinoin dose (YYYY-MM-DD), when known. */
  isotretinoinLastDose: dateISO.default(""),
  medicationsOther: text(500),
  allergies: text(500),
  pregnant: z.boolean().default(false),
  breastfeeding: z.boolean().default(false),
  recentProcedures: z
    .array(z.object({ kind: z.enum(PROCEDURES), date: dateISO.default(""), note: text(200) }))
    .max(10)
    .default([]),
  sunExposure: z.enum(SUN_EXPOSURE).or(z.literal("")).default(""),
  /** Tanned or sunburnt in the last 2 weeks. */
  recentTan: z.boolean().default(false),
  hair: z
    .object({
      lossPattern: z.enum(HAIR_LOSS_PATTERNS).or(z.literal("")).default(""),
      duration: z.enum(HAIR_LOSS_DURATIONS).or(z.literal("")).default(""),
      notes: text(500),
    })
    .default({ lossPattern: "", duration: "", notes: "" }),
  postSurgery: z
    .object({
      surgeryType: text(200),
      surgeryDate: dateISO.default(""),
      surgeon: text(200),
      instructions: text(1000),
    })
    .default({ surgeryType: "", surgeryDate: "", surgeon: "", instructions: "" }),
  notes: text(1000),
});

export type IntakeAnswers = z.infer<typeof intakeAnswersSchema>;

/** Parses stored/untrusted answers, filling defaults so older rows stay readable. */
export function parseIntakeAnswers(raw: unknown): IntakeAnswers {
  const parsed = intakeAnswersSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : intakeAnswersSchema.parse({});
}

// --- Contraindication flags -------------------------------------------------

export type FlagSeverity = "high" | "caution";

export interface ContraindicationFlag {
  key: string;
  severity: FlagSeverity;
  title: string;
  /** Treatments the specialist should review before proceeding. */
  review: string;
}

const DAY_MS = 86_400_000;

function daysSince(dateIso: string, now: Date): number | null {
  if (!dateIso) return null;
  const t = Date.parse(`${dateIso}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / DAY_MS);
}

/**
 * Derives "for specialist review" flags from intake answers. Pure (takes
 * `now`) so it is unit-testable. Ordered high-severity first.
 */
export function deriveContraindicationFlags(answers: IntakeAnswers, now: Date = new Date()): ContraindicationFlag[] {
  const flags: ContraindicationFlag[] = [];
  const has = (c: (typeof CONDITIONS)[number]) => answers.conditions.includes(c);
  const takes = (m: (typeof MEDICATIONS)[number]) => answers.medications.includes(m);

  if (answers.pregnant || answers.breastfeeding) {
    flags.push({
      key: "pregnancy",
      severity: "high",
      title: answers.pregnant ? "Pregnant" : "Breastfeeding",
      review: "Laser/IPL, chemical peels, retinoids, injectables and electrical devices. Confirm LED and any active products with the specialist.",
    });
  }

  if (takes("isotretinoin")) {
    const since = daysSince(answers.isotretinoinLastDose, now);
    // Unknown date counts as recent: the safe assumption.
    if (since === null || since < 183) {
      flags.push({
        key: "isotretinoin",
        severity: "high",
        title: since === null ? "Isotretinoin (date of last dose unknown)" : `Isotretinoin within 6 months (${since} days ago)`,
        review: "Laser/IPL, chemical peels, microneedling, dermabrasion and waxing.",
      });
    }
  }

  if (has("pacemaker")) {
    flags.push({
      key: "pacemaker",
      severity: "high",
      title: "Pacemaker or metal implants",
      review: "Radiofrequency, EMS/microcurrent and any electrical device.",
    });
  }
  if (has("bleedingDisorder")) {
    flags.push({
      key: "bleedingDisorder",
      severity: "high",
      title: "Bleeding / clotting disorder",
      review: "Microneedling, injectables and any procedure that breaks the skin.",
    });
  }
  if (has("keloid")) {
    flags.push({
      key: "keloid",
      severity: "high",
      title: "Keloid / raised scar tendency",
      review: "Microneedling, ablative laser, deep peels and dermabrasion.",
    });
  }
  if (has("skinCancer")) {
    flags.push({
      key: "skinCancer",
      severity: "high",
      title: "Skin cancer history",
      review: "Any treatment over suspicious or treated lesions; laser/IPL. Specialist review first.",
    });
  }

  if (takes("topicalRetinoids")) {
    flags.push({
      key: "retinoids",
      severity: "caution",
      title: "Uses topical retinoids",
      review: "Chemical peels, microdermabrasion, waxing and laser. Usually paused several days before.",
    });
  }
  if (takes("bloodThinners")) {
    flags.push({
      key: "bloodThinners",
      severity: "caution",
      title: "Takes blood thinners",
      review: "Microneedling and injectables (bruising / bleeding). Do not advise stopping medication.",
    });
  }
  if (takes("photosensitizing")) {
    flags.push({
      key: "photosensitizing",
      severity: "caution",
      title: "Photosensitizing medication",
      review: "Laser/IPL, LED and chemical peels.",
    });
  }
  if (takes("oralSteroids")) {
    flags.push({
      key: "oralSteroids",
      severity: "caution",
      title: "Oral steroids",
      review: "Healing and skin fragility: peels, microneedling, resurfacing.",
    });
  }
  if (has("herpes")) {
    flags.push({
      key: "herpes",
      severity: "caution",
      title: "Herpes / cold sores",
      review: "Facial laser, peels and microneedling can trigger an outbreak. Doctor may advise prophylaxis.",
    });
  }
  if (has("epilepsy")) {
    flags.push({
      key: "epilepsy",
      severity: "caution",
      title: "Epilepsy / seizures",
      review: "Flashing-light devices (IPL, LED) and electrical stimulation.",
    });
  }
  if (has("autoimmune")) {
    flags.push({
      key: "autoimmune",
      severity: "caution",
      title: "Autoimmune condition",
      review: "Healing response and skin reactivity; review before invasive or resurfacing treatments.",
    });
  }
  if (has("diabetes")) {
    flags.push({
      key: "diabetes",
      severity: "caution",
      title: "Diabetes",
      review: "Slower healing and infection risk: microneedling, peels, lymphatic work on compromised skin.",
    });
  }
  if (has("heart") || has("hypertension")) {
    flags.push({
      key: "cardio",
      severity: "caution",
      title: has("heart") ? "Heart condition" : "High blood pressure",
      review: "Pressotherapy, lymphatic drainage intensity and heat-based treatments.",
    });
  }
  if (has("eczemaPsoriasis") || has("vitiligo")) {
    flags.push({
      key: "skinCondition",
      severity: "caution",
      title: "Active skin condition (eczema / psoriasis / vitiligo)",
      review: "Avoid treating over active areas; patch test.",
    });
  }
  if (answers.recentTan) {
    flags.push({
      key: "recentTan",
      severity: "caution",
      title: "Tanned or sunburnt in the last 2 weeks",
      review: "Laser/IPL and peels (pigmentation / burn risk).",
    });
  }
  for (const p of answers.recentProcedures) {
    const since = daysSince(p.date, now);
    const window = p.kind === "surgery" ? 42 : 14;
    if (since !== null && since >= 0 && since < window) {
      flags.push({
        key: `recent-${p.kind}`,
        severity: "caution",
        title: `Recent ${PROCEDURE_LABELS[p.kind].toLowerCase()} (${since} days ago)`,
        review:
          p.kind === "surgery"
            ? "Only post-operative protocols approved by the surgeon."
            : "Space treatments on the same area; check with the specialist.",
      });
    }
  }
  if (answers.allergies) {
    flags.push({
      key: "allergies",
      severity: "caution",
      title: `Allergies: ${answers.allergies.slice(0, 80)}`,
      review: "Check every product and topical anaesthetic against the listed allergies.",
    });
  }

  return flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}

// --- Diff ----------------------------------------------------------------------

const FIELD_LABELS: Record<keyof IntakeAnswers, string> = {
  skinType: "Skin type",
  concerns: "Main concerns",
  goals: "Goals",
  conditions: "Medical conditions",
  conditionsOther: "Other conditions",
  medications: "Medications",
  isotretinoinLastDose: "Isotretinoin last dose",
  medicationsOther: "Other medications",
  allergies: "Allergies",
  pregnant: "Pregnant",
  breastfeeding: "Breastfeeding",
  recentProcedures: "Recent procedures",
  sunExposure: "Sun exposure",
  recentTan: "Recent tan / sunburn",
  hair: "Hair loss",
  postSurgery: "Post-surgery details",
  notes: "Notes",
};

// Order-insensitive for the multi-select arrays so re-ticking the same boxes
// in a different order is not reported as a change.
function normalizeForCompare(value: unknown): string {
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return JSON.stringify([...(value as string[])].sort());
  }
  return JSON.stringify(value);
}

/** Labels of the answer fields that differ between two intakes. */
export function diffIntakeAnswers(before: IntakeAnswers, after: IntakeAnswers): string[] {
  return (Object.keys(FIELD_LABELS) as (keyof IntakeAnswers)[])
    .filter((k) => normalizeForCompare(before[k]) !== normalizeForCompare(after[k]))
    .map((k) => FIELD_LABELS[k]);
}
