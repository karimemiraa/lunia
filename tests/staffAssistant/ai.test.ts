import { describe, it, expect, vi } from "vitest";
import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";
import { answerWithAi, aiToolsFor, ASSISTANT_MODEL, MAX_TOOL_ROUNDS, type AssistantAiClient } from "@/modules/staffAssistant/ai";
import { askAssistant } from "@/modules/staffAssistant/assistant";
import type { AssistantViewer } from "@/modules/staffAssistant/types";

// The Claude connector, driven by a scripted fake client: checks the request we
// send (model, tools filtered by role, caching, fallbacks) and the tool loop
// (results returned by id in one message, errors flagged, round cap, refusals).

const ALL = new Set(Object.values(PERMISSIONS) as PermissionKey[]);
const owner: AssistantViewer = { id: "ai-owner", name: "Owner", permissions: ALL };
const frontDesk: AssistantViewer = {
  id: "ai-desk",
  name: "Desk",
  permissions: new Set<PermissionKey>([PERMISSIONS.BOOKING_VIEW, PERMISSIONS.BOOKING_MANAGE, PERMISSIONS.CLIENT_VIEW]),
};

type Block = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
interface Scripted {
  stop_reason: string;
  content: Block[];
}

function fakeClient(script: Scripted[] | (() => Scripted)) {
  const calls: Record<string, unknown>[] = [];
  const create = vi.fn(async (params: Record<string, unknown>) => {
    calls.push(structuredClone(params)); // the loop mutates `messages` afterwards
    const next = typeof script === "function" ? script() : script.shift();
    if (!next) throw new Error("script exhausted");
    return { id: "msg", type: "message", role: "assistant", model: ASSISTANT_MODEL, usage: {}, ...next };
  });
  return { client: { beta: { messages: { create } } } as unknown as AssistantAiClient, calls, create };
}

const text = (t: string): Scripted => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });
type Msg = { role: string; content: unknown };
const lastUser = (call: Record<string, unknown>) => (call.messages as Msg[]).at(-1)!;

describe("Claude connector", () => {
  it("sends a cacheable request with only the tools this role may use", async () => {
    const { client, calls } = fakeClient([text("Hello!")]);
    const reply = await answerWithAi(client, "hi", [], frontDesk);
    expect(reply).toMatchObject({ text: "Hello!", source: "ai" });

    const req = calls[0]!;
    expect(req.model).toBe(ASSISTANT_MODEL);
    expect(req.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(req.fallbacks).toBe("default");
    expect(req.output_config).toEqual({ effort: "medium" });
    expect((req.system as { cache_control?: unknown }[])[0]!.cache_control).toEqual({ type: "ephemeral" });

    const names = (req.tools as { name: string }[]).map((t) => t.name);
    expect(names).toEqual([...names].sort());
    expect(names).toEqual(expect.arrayContaining(["appointments_summary", "find_customer", "find_page", "search_help", "draft_edit_request", "needs_attention"]));
    expect(names).not.toContain("revenue_summary");
    expect(names).not.toContain("unpaid_invoices");
    // JSON schema, without the $schema key the API doesn't want.
    for (const t of req.tools as { input_schema: Record<string, unknown> }[]) {
      expect(t.input_schema.type).toBe("object");
      expect(t.input_schema.$schema).toBeUndefined();
    }
    // Per-request context goes in the user turn, not the (cached) system prompt.
    expect(String(lastUser(req).content)).toMatch(/^\[Today in Riyadh: \d{4}-\d{2}-\d{2}\. Staff member: Desk\.\]\nhi$/);
  });

  it("is deterministic per role (stable tool prefix for caching)", () => {
    expect(JSON.stringify(aiToolsFor(owner))).toBe(JSON.stringify(aiToolsFor(owner)));
    expect(aiToolsFor(owner).length).toBeGreaterThan(aiToolsFor(frontDesk).length);
  });

  it("runs parallel tool calls and returns all results in one message, by id", async () => {
    const { client, calls } = fakeClient([
      {
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "tu_1", name: "find_page", input: { query: "payroll" } },
          { type: "tool_use", id: "tu_2", name: "search_help", input: { query: "issue a refund" } },
        ],
      },
      text("Payroll is under HR; here's how refunds work."),
    ]);
    const reply = await answerWithAi(client, "where is payroll and how do refunds work", [], owner);

    const results = lastUser(calls[1]!).content as { type: string; tool_use_id: string; is_error?: boolean; content: string }[];
    expect(results.map((r) => [r.type, r.tool_use_id])).toEqual([
      ["tool_result", "tu_1"],
      ["tool_result", "tu_2"],
    ]);
    expect(results[0]!.content).toContain("/admin/hr/payroll");
    expect(results[1]!.content).toContain("Issue credit note");
    // The assistant turn (with its tool_use blocks) is kept verbatim before the results.
    expect((calls[1]!.messages as Msg[]).at(-2)!.role).toBe("assistant");

    expect(reply.links?.map((l) => l.href)).toContain("/admin/hr/payroll");
    expect(reply.guide?.id).toBe("refund");
  });

  it("passes tool figures through so numbers come from the database", async () => {
    const { client, calls } = fakeClient([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu_r", name: "unpaid_invoices", input: {} }] },
      text("Here are the unpaid invoices."),
    ]);
    const reply = await answerWithAi(client, "unpaid?", [], owner);
    const result = (lastUser(calls[1]!).content as { content: string }[])[0]!.content;
    expect(JSON.parse(result).figures.map((f: { label: string }) => f.label)).toContain("Outstanding");
    expect(reply.stats?.map((s) => s.label)).toContain("Outstanding");
  });

  it("returns permission denials to the model instead of data", async () => {
    const { client, calls } = fakeClient([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu_x", name: "revenue_summary", input: { period: "today" } }] },
      text("You don't have access to revenue."),
    ]);
    const reply = await answerWithAi(client, "revenue today", [], frontDesk);
    const result = (lastUser(calls[1]!).content as { content: string }[])[0]!.content;
    expect(result).toContain("doesn't include access");
    expect(reply.stats).toBeUndefined();
  });

  it("flags tool errors with is_error and lets the model recover", async () => {
    const { client, calls } = fakeClient([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu_bad", name: "revenue_summary", input: { period: "decade" } }] },
      text("Sorry, I can only do standard periods."),
    ]);
    const reply = await answerWithAi(client, "revenue this decade", [], owner);
    const result = (lastUser(calls[1]!).content as { is_error?: boolean }[])[0]!;
    expect(result.is_error).toBe(true);
    expect(reply.text).toContain("standard periods");
  });

  it("drafts an edit request for the user to review (never sends it)", async () => {
    const { client } = fakeClient([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu_d", name: "draft_edit_request", input: { title: "Add VAT number field", details: "Customers need a VAT number on invoices." } }] },
      text("I've drafted it — review and send."),
    ]);
    const reply = await answerWithAi(client, "we need a VAT number field", [], frontDesk);
    expect(reply.requestDraft).toEqual({ title: "Add VAT number field", details: "Customers need a VAT number on invoices." });
  });

  it("continues after pause_turn and handles refusals", async () => {
    const paused = fakeClient([{ stop_reason: "pause_turn", content: [{ type: "text", text: "…" }] }, text("Done.")]);
    expect((await answerWithAi(paused.client, "q", [], owner)).text).toBe("Done.");
    expect(paused.create).toHaveBeenCalledTimes(2);

    const refused = fakeClient([{ stop_reason: "refusal", content: [] }]);
    const r = await answerWithAi(refused.client, "q", [], owner);
    expect(r.text).toMatch(/can't help with that/);
  });

  it("stops after the round cap, and the assistant falls back to built-in answers", async () => {
    const loop = fakeClient(() => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id: `tu_${Math.random()}`, name: "needs_attention", input: {} }] }));
    await expect(answerWithAi(loop.client, "q", [], owner)).rejects.toThrow(/round limit/);
    expect(loop.create).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);

    const onAiError = vi.fn();
    const failing = fakeClient(() => {
      throw new Error("network down");
    });
    const reply = await askAssistant("open payroll", [], owner, { client: failing.client, onAiError });
    expect(onAiError).toHaveBeenCalled();
    expect(reply.source).toBe("rules");
    expect(reply.navigateTo).toBe("/admin/hr/payroll");
  });

  it("uses the built-in engine when no key is configured", async () => {
    const reply = await askAssistant("open payroll", [], owner, { client: null });
    expect(reply.source).toBe("rules");
  });

  it("keeps only the last 10 turns of history", async () => {
    const { client, calls } = fakeClient([text("ok")]);
    const history = Array.from({ length: 14 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", text: `t${i}` }));
    await answerWithAi(client, "q", history, owner);
    expect((calls[0]!.messages as Msg[]).length).toBe(11);

    // A trimmed history never starts with an assistant turn.
    const odd = fakeClient([text("ok")]);
    await answerWithAi(odd.client, "q", history.slice(1, 12), owner);
    expect((odd.calls[0]!.messages as Msg[])[0]!.role).toBe("user");
  });
});
