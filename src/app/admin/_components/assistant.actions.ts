"use server";

import { requireAdmin } from "./requireAdmin";
import { askAssistant, buildViewer } from "@/modules/staffAssistant/assistant";
import { createEditRequest } from "@/modules/editRequests/editRequests";
import type { AssistantReply, ChatTurn } from "@/modules/staffAssistant/types";

const MAX_QUESTION = 1000;

/**
 * Ask Lunia. The viewer (permissions, hidden menu items) is resolved from the
 * session on the server — never trusted from the client — so the assistant can
 * only show pages and numbers this staff member's role may see.
 */
export async function askAssistantAction(question: string, history: ChatTurn[] = []): Promise<AssistantReply> {
  const user = await requireAdmin();
  const q = typeof question === "string" ? question.trim().slice(0, MAX_QUESTION) : "";
  if (!q) return { text: "Type a question first.", source: "rules" };
  const safeHistory: ChatTurn[] = Array.isArray(history)
    ? history
        .filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.text === "string" && t.text.trim())
        .slice(-10)
        .map((t) => ({ role: t.role, text: t.text.slice(0, 2000) }))
    : [];
  const viewer = await buildViewer(user);
  try {
    return await askAssistant(q, safeHistory, viewer);
  } catch (error) {
    console.error("[ask-lunia] failed:", error);
    return { text: "Sorry — something went wrong on my side. Please try again in a moment.", source: "rules" };
  }
}

export interface EditRequestActionState {
  success?: boolean;
  error?: string;
  id?: string;
}

/** Any staff member can file an edit request from the assistant; owners review them in /admin/requests. */
export async function createEditRequestAction(input: { title: string; details: string; priority?: string; pagePath?: string | null }): Promise<EditRequestActionState> {
  const user = await requireAdmin();
  const viewer = await buildViewer(user);
  try {
    const row = await createEditRequest(
      {
        title: String(input?.title ?? ""),
        details: String(input?.details ?? ""),
        priority: (input?.priority as "LOW" | "NORMAL" | "HIGH" | undefined) ?? "NORMAL",
        pagePath: input?.pagePath || null,
      },
      { id: user.id, name: viewer.name },
    );
    return { success: true, id: row.id };
  } catch (error) {
    const issue = (error as { issues?: { message: string }[] })?.issues?.[0]?.message;
    if (!issue) console.error("[ask-lunia] edit request failed:", error);
    return { error: issue ?? "Couldn't send the request. Please try again." };
  }
}
