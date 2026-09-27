// Picks the understanding engine: the rule-based one by default, or the
// Gemini adapter (rules + model) when the Superadmin has configured
// AI_PROVIDER=gemini and AI_API_KEY. The choice is cached briefly so each
// chat message doesn't hit the secrets table.

import { getSecret } from "@/modules/platform/secrets";
import { createGeminiEngine } from "./gemini";
import { ruleEngine, type NluEngine } from "./rules";

const CACHE_MS = 60_000;
let cached: { engine: NluEngine; at: number } | null = null;

export async function getNluEngine(): Promise<NluEngine> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.engine;
  let engine: NluEngine = ruleEngine;
  try {
    const [provider, apiKey, model] = await Promise.all([getSecret("AI_PROVIDER"), getSecret("AI_API_KEY"), getSecret("AI_MODEL")]);
    if (provider?.trim().toLowerCase() === "gemini" && apiKey) engine = createGeminiEngine({ apiKey, model });
  } catch {
    // Secrets unavailable -> rules only.
  }
  cached = { engine, at: Date.now() };
  return engine;
}
