// Shared shapes for the website assistant: the consultation profile it
// builds, what the "understanding" layer extracts from one message, and the
// view the client renders. Client-safe (no server imports).

export const CONCERNS = [
  "acne",
  "scars",
  "pigmentation",
  "dullness",
  "dryness",
  "sensitivity",
  "aging",
  "pores",
  "oiliness",
  "dark_circles",
  "hair_loss",
  "dandruff",
  "hair_damage",
  "post_surgery",
] as const;
export type Concern = (typeof CONCERNS)[number];

export const AREAS = ["face", "scalp", "body"] as const;
export type Area = (typeof AREAS)[number];

export const SKIN_TYPES = ["dry", "oily", "combination", "normal", "sensitive"] as const;
export type SkinType = (typeof SKIN_TYPES)[number];

export const GOALS = ["clear_skin", "glow", "even_tone", "hydration", "anti_aging", "hair_growth", "scalp_health", "recovery", "maintenance"] as const;
export type Goal = (typeof GOALS)[number];

export const EVENTS = ["wedding", "engagement", "party", "graduation", "eid", "travel"] as const;
export type EventKind = (typeof EVENTS)[number];

export const CONTRAINDICATIONS = ["pregnant", "breastfeeding", "recent_procedure", "infection", "allergies"] as const;
export type Contraindication = (typeof CONTRAINDICATIONS)[number];

export const INTENTS = [
  "book",
  "callback",
  "human",
  "whatsapp",
  "faq_hours",
  "faq_location",
  "faq_price",
  "faq_giftcard",
  "faq_payment",
  "faq_parking",
  "faq_duration",
  "greeting",
  "thanks",
  "yes",
  "no",
  "skip",
  "restart",
  "recommend",
] as const;
export type Intent = (typeof INTENTS)[number];

export const CALLBACK_WINDOWS = ["asap", "morning", "afternoon", "evening"] as const;
export type CallbackWindow = (typeof CALLBACK_WINDOWS)[number];

/** Everything the rule-based (or model) layer pulled out of one message. */
export interface Understanding {
  intents: Intent[];
  concerns: Concern[];
  areas: Area[];
  skinType?: SkinType;
  goals: Goal[];
  event?: EventKind;
  /** Approximate duration of the concern, in months. */
  durationMonths?: number;
  /** Weeks until the event / wanted result, when a timeline was given. */
  timelineWeeks?: number;
  previousTreatments: string[];
  /** True when the visitor said they tried nothing yet. */
  triedNothing?: boolean;
  contraindications: Contraindication[];
  /** True when the visitor explicitly said none of the safety items apply. */
  noContraindications?: boolean;
  phone?: string;
  name?: string;
  code?: string;
}

/** The structured consultation facts stored on ChatSession.profile. */
export interface ConsultProfile {
  concerns: Concern[];
  areas: Area[];
  skinType?: SkinType;
  goals: Goal[];
  event?: EventKind;
  durationMonths?: number;
  durationText?: string;
  timelineWeeks?: number;
  timelineText?: string;
  previousTreatments: string[];
  triedText?: string;
  contraindications: Contraindication[];
  safetyAnswered?: boolean;
  /** Free-text the assistant couldn't classify, kept for the specialist. */
  notes: string[];
}

export function emptyProfile(): ConsultProfile {
  return { concerns: [], areas: [], goals: [], previousTreatments: [], contraindications: [], notes: [] };
}

// --- View (what the widget renders) ------------------------------------

export interface ServiceCardView {
  serviceId: string;
  name: string;
  duration: string;
  price: string;
  why: string;
  bookable: boolean;
  note?: string;
}

export interface LinkView {
  label: string;
  href: string;
  external?: boolean;
}

export interface SummaryView {
  title: string;
  rows: { label: string; value: string }[];
}

export interface ChatMessageView {
  id: string;
  from: "bot" | "user";
  text: string;
  cards?: ServiceCardView[];
  links?: LinkView[];
  summary?: SummaryView;
}

export interface ChipView {
  value: string;
  label: string;
  tone?: "primary" | "default";
}

export type InputKind = "text" | "name" | "tel" | "code";

export interface ChatUi {
  chips: ChipView[];
  input: InputKind;
  placeholder: string;
}

export interface ChatView {
  messages: ChatMessageView[];
  ui: ChatUi;
}
