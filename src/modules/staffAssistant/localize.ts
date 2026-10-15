// Ask Lunia in Arabic: the rule engine and the help library are written in
// English; when the staff console is Arabic every visible part of a reply —
// text, guide title and steps, link labels, figures and suggestions — goes
// through the staff-console dictionary (src/app/admin/_i18n/ar/assistant.ts).
// Anything without an entry stays English rather than failing.

import { translate } from "@/app/admin/_i18n/t";
import type { AssistantReply } from "./types";

/** One engine sentence in the viewer's language, with {placeholders} filled. */
export function say(viewer: { locale?: "en" | "ar" }, english: string, vars?: Record<string, string | number>): string {
  return translate(english, viewer.locale === "ar" ? "ar" : "en", vars);
}

export function localizeReply(reply: AssistantReply, locale: "en" | "ar" | undefined): AssistantReply {
  if (locale !== "ar") return reply;
  // Guide steps quote UI labels as [[English label]]; fill each with the label's
  // Arabic from the same dictionary the screens use, so help always matches them.
  const t = (s: string) => translate(s, "ar").replace(/\[\[([^\]]+)\]\]/g, (_m, label: string) => translate(label, "ar"));
  return {
    ...reply,
    text: reply.text
      .split("\n")
      .map((line) => t(line))
      .join("\n"),
    links: reply.links?.map((l) => ({ ...l, label: t(l.label) })),
    stats: reply.stats?.map((s) => ({ ...s, label: t(s.label), value: s.value.replace(/\bSAR\b/g, "ر.س") })),
    guide: reply.guide ? { ...reply.guide, title: t(reply.guide.title), steps: reply.guide.steps.map(t) } : undefined,
    suggestions: reply.suggestions?.map(t),
  };
}
