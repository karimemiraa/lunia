// Optional Gemini adapter for the understanding layer. It is only used when
// the Superadmin sets AI_PROVIDER=gemini and AI_API_KEY (see engine.ts), and
// it never replaces the rules: the model's JSON is validated against the same
// closed vocabularies and merged on top of the rule-based result, and any
// failure (timeout, bad key, malformed output) silently falls back to rules.

import { z } from "zod";
import { AREAS, CONCERNS, CONTRAINDICATIONS, EVENTS, GOALS, INTENTS, SKIN_TYPES, type Understanding } from "../types";
import { mergeUnderstanding, understandText, type NluEngine, type UnderstandContext } from "./rules";

const DEFAULT_MODEL = "gemini-2.5-flash";
const TIMEOUT_MS = 4000;

// Unknown values are dropped rather than failing the whole parse.
const enumList = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .array(z.string())
    .optional()
    .transform((list) => (list ?? []).filter((v): v is T[number] => (values as readonly string[]).includes(v)));
const enumOne = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .nullish()
    .transform((v) => (v && (values as readonly string[]).includes(v) ? (v as T[number]) : undefined));

const modelOutputSchema = z.object({
  intents: enumList(INTENTS),
  concerns: enumList(CONCERNS),
  areas: enumList(AREAS),
  skinType: enumOne(SKIN_TYPES),
  goals: enumList(GOALS),
  event: enumOne(EVENTS),
  durationMonths: z.number().positive().max(600).nullish().transform((v) => v ?? undefined),
  timelineWeeks: z.number().positive().max(520).nullish().transform((v) => v ?? undefined),
  previousTreatments: z.array(z.string().max(40)).max(10).optional().transform((v) => v ?? []),
  contraindications: enumList(CONTRAINDICATIONS),
});

function buildPrompt(text: string, ctx: UnderstandContext): string {
  return [
    "You extract structured facts from one message a visitor wrote to a skin, hair and post-surgery care center in Riyadh.",
    "The message may be Saudi Arabic dialect or English and may contain typos. Only use these values:",
    `intents: ${INTENTS.join(", ")}`,
    `concerns: ${CONCERNS.join(", ")}`,
    `areas: ${AREAS.join(", ")}`,
    `skinType: ${SKIN_TYPES.join(", ")}`,
    `goals: ${GOALS.join(", ")}`,
    `event: ${EVENTS.join(", ")}`,
    `contraindications: ${CONTRAINDICATIONS.join(", ")} (only when stated as true, never when negated)`,
    "durationMonths = how long the concern has lasted; timelineWeeks = weeks until the event or wanted result.",
    ctx.expecting ? `The assistant just asked about: ${ctx.expecting}.` : "",
    "Reply with JSON only.",
    `Message: """${text.replace(/"""/g, "'")}"""`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface GeminiConfig {
  apiKey: string;
  model?: string | null;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
}

export async function geminiExtract(text: string, ctx: UnderstandContext, config: GeminiConfig): Promise<Partial<Understanding> | null> {
  const model = config.model?.trim() || DEFAULT_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await (config.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(text, ctx) }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 400 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const parsed = modelOutputSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Rules first, then whatever Gemini adds; identical to rules when it fails. */
export function createGeminiEngine(config: GeminiConfig): NluEngine {
  return {
    id: "gemini",
    async understand(text, ctx = {}) {
      const base = understandText(text, ctx);
      // Contact details and codes never leave the server.
      if (ctx.expecting === "phone" || ctx.expecting === "code" || ctx.expecting === "name") return base;
      const redacted = text.replace(/[+\d٠-٩][\d٠-٩\s-]{6,}/g, " [number] ");
      const extra = await geminiExtract(redacted, ctx, config);
      return extra ? mergeUnderstanding(base, extra) : base;
    },
  };
}
