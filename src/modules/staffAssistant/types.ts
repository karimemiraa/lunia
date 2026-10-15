// Shared vocabulary for "Ask Lunia", the staff help assistant. Client-safe
// (no DB imports) so the chat panel can render replies with the same types.

import type { PermissionKey } from "@/modules/iam/permissions";

/** Who is asking — every tool and link is filtered by these permissions. */
export interface AssistantViewer {
  id: string;
  name: string;
  permissions: Set<PermissionKey>;
  /** Menu hrefs hidden by the superadmin (never suggested). */
  hiddenHrefs?: string[];
  /** Staff console language; replies are localized for "ar". */
  locale?: "en" | "ar";
}

export interface AssistantLink {
  label: string;
  href: string;
  /** "form" opens a (pre-filled) form the staff member then confirms; "page" just navigates. */
  kind: "page" | "form";
}

export interface AssistantStat {
  label: string;
  value: string;
}

export interface AssistantGuideView {
  id: string;
  title: string;
  steps: string[];
}

export interface AssistantReply {
  /** Plain-text answer (may contain line breaks). */
  text: string;
  links?: AssistantLink[];
  stats?: AssistantStat[];
  guide?: AssistantGuideView;
  /** Ask the panel to show the edit-request form, optionally pre-filled. */
  requestDraft?: { title?: string; details?: string };
  /** When the user explicitly asked to go somewhere ("open payroll"), the panel navigates there. */
  navigateTo?: string;
  /** Follow-up suggestions the user can tap. */
  suggestions?: string[];
  /** "rules" = built-in engine; "ai" = connected AI provider. */
  source: "rules" | "ai";
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}
