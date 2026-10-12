// Ask Lunia orchestrator: builds the viewer (permissions + hidden menu items),
// then answers with Claude when an owner has added an Anthropic key in
// Superadmin, otherwise with the built-in rule engine. Any AI failure falls
// back to the rule engine so the assistant never goes dark.

import { prisma } from "@/lib/db";
import { getSecret } from "@/modules/platform/secrets";
import { getSetting } from "@/modules/cms/settings";
import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";
import { answerWithAi, createAiClient, type AssistantAiClient } from "./ai";
import { answerWithRules } from "./rules";
import type { AssistantReply, AssistantViewer, ChatTurn } from "./types";

/** Superadmin secret holding the Anthropic API key for the staff assistant. */
export const ASSISTANT_KEY_SECRET = "ANTHROPIC_API_KEY";

export async function buildViewer(user: { id: string; permissions: Set<PermissionKey> }): Promise<AssistantViewer> {
  const [profile, navSetting] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { email: true, staffProfile: { select: { fullName: true } } } }),
    getSetting("adminNav").catch(() => null),
  ]);
  // Superadmins see every menu item, so hidden items don't apply to them (same as the sidebar).
  const hiddenHrefs = user.permissions.has(PERMISSIONS.PLATFORM_MANAGE) ? [] : (navSetting?.hiddenHrefs ?? []);
  return {
    id: user.id,
    name: profile?.staffProfile?.fullName?.trim() || profile?.email || "there",
    permissions: user.permissions,
    hiddenHrefs,
  };
}

/** The key from Superadmin, or the ANTHROPIC_API_KEY env var as a fallback. */
export async function getAssistantApiKey(): Promise<string | null> {
  const fromPanel = await getSecret(ASSISTANT_KEY_SECRET).catch(() => null);
  return fromPanel?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || null;
}

export interface AskOptions {
  /** Tests inject a fake client; production builds one from the stored key. */
  client?: AssistantAiClient | null;
  now?: Date;
  onAiError?: (error: unknown) => void;
}

export async function askAssistant(question: string, history: ChatTurn[], viewer: AssistantViewer, opts: AskOptions = {}): Promise<AssistantReply> {
  const now = opts.now ?? new Date();
  let client = opts.client;
  if (client === undefined) {
    const key = await getAssistantApiKey();
    client = key ? createAiClient(key) : null;
  }
  if (client) {
    try {
      return await answerWithAi(client, question, history, viewer, now);
    } catch (error) {
      (opts.onAiError ?? ((e) => console.error("[ask-lunia] AI failed, using built-in answers:", e)))(error);
    }
  }
  return answerWithRules(question, viewer, now);
}
