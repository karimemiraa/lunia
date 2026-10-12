// Optional AI brain for Ask Lunia: Claude (Anthropic) with tool use over the
// SAME permission-checked, read-only tools the built-in engine uses — so every
// number comes from the database, and the model can only see what this staff
// member's role can see. Off until an owner adds an API key in Superadmin
// (secret ANTHROPIC_API_KEY); any failure falls back to the built-in engine.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { matchGuides, guideToView } from "./help";
import { matchDestinations, toLink } from "./navigation";
import { toolsFor, runTool } from "./tools";
import type { AssistantLink, AssistantReply, AssistantStat, AssistantViewer, ChatTurn, AssistantGuideView } from "./types";
import { utcToCenterLocal } from "@/modules/booking/availability";

export const ASSISTANT_MODEL = "claude-opus-5-5";
/** Upper bound on model <-> tool round trips per question. */
export const MAX_TOOL_ROUNDS = 6;

/** The slice of the SDK client the loop uses — lets tests pass a scripted fake. */
export type AssistantAiClient = { beta: { messages: { create: Anthropic["beta"]["messages"]["create"] } } };

// Stable (cacheable) instructions: no dates or per-user data in here.
const SYSTEM_PROMPT = `You are "Ask Lunia", the in-app help assistant for the staff of Lunia, a skin-quality clinic in Riyadh. Staff ask you where things are, how to do tasks in the admin system, and for numbers about the business.

How to answer:
- Numbers: ALWAYS get them from a tool in this conversation. Never estimate, never reuse a number you were not given by a tool, and if no tool covers it, say you can't see that data yet. Quote amounts in SAR as the tool returns them. Periods are in Riyadh time.
- "Where is / open / take me to": call find_page and point to the result.
- "How do I…": call search_help and walk the user through the returned steps; don't invent buttons or pages that the guide doesn't mention.
- If the user wants something in the system changed (a correction, a new field, a bug), call draft_edit_request with a clear title and details — the user reviews and sends it.
- You can't change data yourself. To act, point the user to the page or pre-filled form a tool returned; they confirm there.
- If a tool says the role doesn't include access, tell the user plainly and suggest asking an owner.
- Reply in the user's language (Arabic or English), briefly — 1 to 4 short sentences or a short list. Plain text, no markdown tables.`;

const assistantOnlyTools = {
  find_page: {
    description: "Find the admin page or pre-filled form for what the user wants to open or do (only pages this staff member may open).",
    input: z.object({ query: z.string().min(1).max(200) }),
  },
  search_help: {
    description: "Search the step-by-step help guides for how to do a task in the admin system.",
    input: z.object({ query: z.string().min(1).max(200) }),
  },
  draft_edit_request: {
    description: "Prepare an edit/change request for the owners when the user wants something in the system changed. The user reviews and sends it.",
    input: z.object({ title: z.string().min(3).max(140), details: z.string().min(5).max(4000) }),
  },
} as const;

function schemaOf(input: z.ZodTypeAny): Anthropic.Beta.BetaTool["input_schema"] {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(input, { io: "input" }) as Record<string, unknown>;
  return schema as Anthropic.Beta.BetaTool["input_schema"];
}

/** Tool definitions for this viewer: only the data tools their role allows, plus the assistant tools. */
export function aiToolsFor(viewer: AssistantViewer): Anthropic.Beta.BetaTool[] {
  const data = toolsFor(viewer).map((t) => ({ name: t.name, description: t.description, input_schema: schemaOf(t.input) }));
  const extra = Object.entries(assistantOnlyTools).map(([name, t]) => ({ name, description: t.description, input_schema: schemaOf(t.input) }));
  // Deterministic order keeps the tools prefix cacheable.
  return [...data, ...extra].sort((a, b) => a.name.localeCompare(b.name));
}

interface Collected {
  stats: AssistantStat[];
  links: AssistantLink[];
  guide?: AssistantGuideView;
  requestDraft?: { title?: string; details?: string };
  navigateTo?: string;
}

async function executeTool(name: string, input: unknown, viewer: AssistantViewer, now: Date, out: Collected): Promise<string> {
  if (name === "find_page") {
    const { query } = assistantOnlyTools.find_page.input.parse(input);
    const dests = matchDestinations(query, viewer);
    for (const d of dests) out.links.push(toLink(d));
    return JSON.stringify(dests.length ? dests.map((d) => ({ label: d.label, href: d.href, kind: d.kind })) : { result: "No page this user may open matches that." });
  }
  if (name === "search_help") {
    const { query } = assistantOnlyTools.search_help.input.parse(input);
    const guides = matchGuides(query, viewer).slice(0, 2);
    if (guides[0]) {
      out.guide ??= guideToView(guides[0].guide);
      for (const l of guides[0].guide.links) out.links.push(l);
    }
    return JSON.stringify(guides.length ? guides.map((g) => ({ title: g.guide.title, steps: g.guide.steps, pages: g.guide.links })) : { result: "No guide found." });
  }
  if (name === "draft_edit_request") {
    const draft = assistantOnlyTools.draft_edit_request.input.parse(input);
    out.requestDraft = draft;
    return JSON.stringify({ result: "Draft shown to the user for review; it is not sent until they press Send." });
  }
  const r = await runTool(name, input, viewer, now);
  out.stats.push(...r.stats);
  out.links.push(...r.links);
  return JSON.stringify({ title: r.title, summary: r.summary, figures: r.stats, pages: r.links });
}

function dedupeLinks(links: AssistantLink[]): AssistantLink[] {
  const seen = new Set<string>();
  return links.filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true))).slice(0, 6);
}

/**
 * Answer with Claude. Manual tool loop: the model calls tools, we execute them
 * (permission re-checked inside runTool) and feed results back, until it ends
 * its turn or MAX_TOOL_ROUNDS is reached. Tool figures/links are returned
 * alongside the text so the panel shows the database's numbers, not prose.
 */
export async function answerWithAi(
  client: AssistantAiClient,
  question: string,
  history: ChatTurn[],
  viewer: AssistantViewer,
  now: Date = new Date(),
): Promise<AssistantReply> {
  const tools = aiToolsFor(viewer);
  const today = utcToCenterLocal(now).dateISO;
  const recent = history.slice(-10);
  while (recent[0]?.role === "assistant") recent.shift(); // the conversation must open with a user turn
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...recent.map((t) => ({ role: t.role, content: t.text }) as Anthropic.Beta.BetaMessageParam),
    { role: "user", content: `[Today in Riyadh: ${today}. Staff member: ${viewer.name}.]\n${question}` },
  ];
  const out: Collected = { stats: [], links: [] };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: ASSISTANT_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      // One breakpoint at the end of the system prompt caches tools + system.
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools,
      messages,
    });

    if (response.stop_reason === "refusal") {
      return { text: "I can't help with that one. Try rephrasing, or ask about a page, a task or a number.", source: "ai" };
    }
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason === "tool_use" && toolUses.length > 0) {
      messages.push({ role: "assistant", content: response.content });
      // All results go back in ONE user message (keeps parallel tool calls working).
      const results = await Promise.all(
        toolUses.map(async (tu): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          try {
            return { type: "tool_result", tool_use_id: tu.id, content: await executeTool(tu.name, tu.input, viewer, now, out) };
          } catch (error) {
            return { type: "tool_result", tool_use_id: tu.id, is_error: true, content: error instanceof Error ? error.message : "Tool failed." };
          }
        }),
      );
      messages.push({ role: "user", content: results });
      continue;
    }

    // end_turn / max_tokens / stop_sequence: return what the model wrote.
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return {
      text: text || "Here's what I found.",
      stats: out.stats.length ? out.stats.slice(0, 8) : undefined,
      links: dedupeLinks(out.links),
      guide: out.guide,
      requestDraft: out.requestDraft,
      source: "ai",
    };
  }
  throw new Error("Assistant tool loop exceeded its round limit.");
}

/** Lazily build the real client from the Superadmin-managed key. */
export function createAiClient(apiKey: string): AssistantAiClient {
  return new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
}
