// Display text for timeline rows. The timeline module (src/modules/crm/timelineCore)
// builds English titles/details; in Arabic we recognise those shapes and render
// the same facts through the staff dictionary. Anything unrecognised (service
// names, notes, codes) is shown as is.

import type { TimelineEntry } from "@/modules/crm/timelineCore";
import type { T } from "../../../_i18n/t";

/** Enum statuses shown on timeline rows → English label (translated with t). */
export const TIMELINE_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Requested",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
  DRAFT: "Draft",
  ISSUED: "Issued",
  PARTIALLY_PAID: "Part-paid",
  PAID: "Paid",
  VOID: "Void",
  OPEN: "Open",
  DONE: "Done",
  NO_ANSWER: "No answer",
  WAITING: "Waiting",
  NOTIFIED: "Notified",
  APPROVED: "Approved",
  BOOKED: "Booked",
  EXPIRED: "Expired",
  REJECTED: "Rejected",
  PENDING: "Pending",
  CONVERTED: "Converted",
  IN_PROGRESS: "In progress",
  HANDLED: "Handled",
  AWAITING: "Awaiting",
  CALLBACK: "Callback",
  LEAD: "Lead",
  WHATSAPP: "Whatsapp",
  ABANDONED: "Abandoned",
};

export function timelineStatusLabel(status: string, t: T): string {
  const label = TIMELINE_STATUS_LABELS[status];
  const translated = label ? t(label) : null;
  // English keeps the raw enum wording the feed has always shown.
  return translated && translated !== label ? translated : status.replace(/_/g, " ");
}

/** Lower-case words the module derives from enums (payment methods, lead kinds, outcomes, loyalty reasons, photo kinds). */
const WORDS = new Set([
  "cash",
  "card",
  "mada",
  "apple pay",
  "bank transfer",
  "gift card",
  "package",
  "online",
  "other",
  "earn",
  "redeem",
  "adjust",
  "tier",
  "call",
  "whatsapp",
  "email",
  "sms",
  "note",
  "stage change",
  "assign",
  "no answer",
  "interested",
  "not interested",
  "booked",
  "callback",
  "lead created",
  "before",
  "after",
  "analysis",
]);

/** Translates a whole lower-case enum phrase (e.g. "bank transfer") when known. */
function word(s: string, t: T): string {
  const key = s.trim().toLowerCase();
  if (!WORDS.has(key)) return s;
  const translated = t(key);
  // English: keep the original text (and its casing) untouched.
  return translated === key ? s : translated;
}

/** "1,200 SAR" → "1,200 ر.س" (amounts keep Western digits). */
function sar(s: string, t: T): string {
  return s.replace(/(\d[\d,.]*) SAR/g, (_m, n: string) => `${n} ${t("SAR")}`);
}

function capitalised(s: string): string {
  return s.replace(/^\w/, (c) => c.toUpperCase());
}

export function timelineTitle(e: TimelineEntry, t: T): string {
  const s = e.title;
  let m: RegExpMatchArray | null;
  switch (e.kind) {
    case "invoice":
      if (s === "Draft invoice") return t("Draft invoice");
      if ((m = s.match(/^Credit note (.+)$/))) return t("Credit note {number}", { number: m[1] });
      if ((m = s.match(/^Invoice (.+)$/))) return t("Invoice {number}", { number: m[1] });
      return s;
    case "payment":
      if ((m = s.match(/^Refund (.+)$/))) return t("Refund {amount}", { amount: sar(m[1]!, t) });
      if ((m = s.match(/^Payment (.+)$/))) return t("Payment {amount}", { amount: sar(m[1]!, t) });
      return s;
    case "package":
      if ((m = s.match(/^Package purchased: (.+)$/))) return t("Package purchased: {name}", { name: m[1] });
      if ((m = s.match(/^Package session used: (.+)$/))) return t("Package session used: {name}", { name: m[1] });
      return s;
    case "giftcard":
      if ((m = s.match(/^Gift card (.+) issued$/))) return t("Gift card {code} issued", { code: m[1] });
      if ((m = s.match(/^Gift card (.+) redeemed$/))) return t("Gift card {code} redeemed", { code: m[1] });
      return s;
    case "loyalty":
      if ((m = s.match(/^([+-]?\d+) pts$/))) return t("{points} pts", { points: m[1] });
      return s;
    case "chat":
    case "callback":
    case "whatsapp":
    case "inquiry":
      return t(s);
    case "note":
    case "lead": {
      m = s.match(/^(.+?) by (.+)$/);
      const what = m ? m[1]! : s;
      const whatText = what === "Pinned note" || what === "Note" ? t(what) : capitalised(word(what, t));
      return m ? t("{what} by {name}", { what: whatText, name: m[2] }) : whatText;
    }
    case "consent":
      if ((m = s.match(/^Consent signed: (.+)$/))) return t("Consent signed: {title}", { title: m[1] });
      return s;
    case "treatment":
      if ((m = s.match(/^Treatment: (.+)$/))) return t("Treatment: {name}", { name: m[1] === "session" ? t("session") : m[1] });
      return s;
    case "photo":
      if ((m = s.match(/^(\w+) photo(?: · (.+))?$/))) {
        const kind = capitalised(word(m[1]!, t));
        return m[2] ? t("{kind} photo · {area}", { kind, area: m[2] }) : t("{kind} photo", { kind });
      }
      return s;
    case "review":
      if (s === "Review requested") return t("Review requested");
      if ((m = s.match(/^Review: (\d+)\/5(?: · (.+))?$/))) return m[2] ? t("Review: {rating}/5 · {title}", { rating: m[1], title: m[2] }) : t("Review: {rating}/5", { rating: m[1] });
      return s;
    case "waitlist":
      if ((m = s.match(/^Joined waitlist: (.+)$/))) return t("Joined waitlist: {service}", { service: m[1] });
      return s;
    default:
      return s;
  }
}

export function timelineDetail(e: TimelineEntry, t: T): string | undefined {
  const s = e.detail;
  if (!s) return s;
  let m: RegExpMatchArray | null;
  switch (e.kind) {
    case "booking":
      if ((m = s.match(/^with (.+)$/))) return t("with {name}", { name: m[1] });
      return s;
    case "invoice":
      if ((m = s.match(/^(.+) · (.+) outstanding$/))) return t("{total} · {amount} outstanding", { total: sar(m[1]!, t), amount: sar(m[2]!, t) });
      return sar(s, t);
    case "giftcard":
      return sar(s, t);
    case "payment": {
      const [method, ...rest] = s.split(" · ");
      return [word(method!, t), ...rest].join(" · ");
    }
    case "package":
      if ((m = s.match(/^(\d+) sessions$/))) return t("{count} sessions", { count: m[1] });
      return s;
    case "loyalty":
      return word(s, t);
    case "callback":
    case "lead":
      // "topic · outcome" or "outcome · body": translate the parts that are enum words.
      return s
        .split(" · ")
        .map((part) => word(part, t))
        .join(" · ");
    case "treatment":
      return s
        .split(" · ")
        .map((part) => {
          let p: RegExpMatchArray | null;
          if ((p = part.match(/^by (.+)$/))) return t("by {name}", { name: p[1] });
          if ((p = part.match(/^reaction: (.+)$/))) return t("reaction: {reaction}", { reaction: p[1] });
          return part;
        })
        .join(" · ");
    case "waitlist":
      if ((m = s.match(/^for (.+)$/))) return t("for {date}", { date: m[1] });
      return s;
    default:
      return s;
  }
}
