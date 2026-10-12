// The built-in "Ask Lunia" engine: understands common staff requests in English
// and Arabic without any AI provider. Order of precedence:
//   1. edit requests ("request a change…")      → request form
//   2. numbers ("revenue this month?")           → read-only data tools
//   3. how-to ("how do I issue a refund?")       → step-by-step guide
//   4. actions ("book Sara", "new invoice")      → (pre-filled) form links
//   5. navigation ("open payroll")               → page link / navigate
// Anything else gets a friendly fallback with suggestions — never a guess.

import { PERMISSIONS } from "@/modules/iam/permissions";
import { matchGuides, guideToView } from "./help";
import { matchDestinations, toLink } from "./navigation";
import { PERIODS, type Period } from "./periods";
import { normalize, hasArabic } from "./text";
import { runTool, toolsFor, type ToolName } from "./tools";
import type { AssistantReply, AssistantViewer } from "./types";

export const DEFAULT_SUGGESTIONS = ["What needs my attention?", "Revenue today", "How do I issue a refund?", "Open the calendar", "Request an edit"];
const AR_SUGGESTIONS = ["ماذا ينتظرني؟", "إيرادات اليوم", "كيف أصدر استرداد؟", "افتح التقويم", "طلب تعديل"];

// ---- intent vocab -------------------------------------------------------------

const RE = {
  greeting: /^(hi|hello|hey|salam|مرحبا|اهلا|السلام عليكم|هلا)\b|^help$|^مساعده$/,
  request: /\b(request|suggest|report)\b.*\b(change|edit|fix|feature|bug|update)\b|\b(edit|change|feature) request\b|\brequest an? edit\b|طلب تعديل|اقتراح|ابلاغ عن|طلب تغيير/,
  myRequests: /\bmy (edit |change )?requests\b|طلباتي/,
  howTo: /\bhow (do|can|to|should|would)\b|\bhow\b.*\?$|\b(steps|guide|tutorial|explain|walk me through|teach)\b|^how |كيف|طريقه|خطوات|اشرح/,
  navVerb: /^(go to|open|show me|show|take me to|navigate to|bring me to|jump to)\b|^(افتح|اذهب|انتقل|خذني|اعرض)/,
  find: /^(find|search|look ?up|search for|who is)\s+(?:customer\s+|client\s+)?(.+)$|^(?:ابحث عن|ابحث|بحث عن)\s+(.+)$/,
  book: /^(book walk-?in|new booking|create booking|make a booking|book|walk-?in)(?:\s+(?:for\s+)?(.+))?$|^(?:احجز|حجز جديد)(?:\s+(?:ل|لـ)?\s*(.+))?$/,
  invoice: /^(?:new invoice|create invoice|invoice|bill|checkout|check out)(?:\s+for\s+(.+))?$|^(?:فاتوره جديده|فاتوره)(?:\s+ل\s*(.+))?$/,
  addLead: /\b(add|new|create)\s+(a\s+)?(lead|customer|client|prospect)\b|عميل جديد|اضافه عميل/,
};

const METRICS: { tool: ToolName; re: RegExp }[] = [
  { tool: "unpaid_invoices", re: /\b(unpaid|outstanding|owed|overdue|awaiting payment|owing|debts?)\b|غير مدفوع|مستحق|ديون|متاخر/ },
  { tool: "revenue_summary", re: /\b(revenue|sales|income|collected|earnings|earned|turnover|takings|money)\b|ايراد|مبيعات|دخل|المحصل|ارباح/ },
  { tool: "low_stock", re: /\b(low stock|out of stock|reorder|running out|stock levels?)\b|نقص المخزون|المخزون المنخفض|نفاد/ },
  { tool: "bookings_made", re: /\b(bookings? (made|created|taken)|new bookings|how many bookings)\b|حجوزات جديده|عدد الحجوزات/ },
  { tool: "appointments_summary", re: /\b(appointments?|visits?|no[- ]?shows?|cancell?ations?|cancell?ed)\b|مواعيد|موعد|زيارات|لم يحضر|الغاء/ },
  { tool: "customer_counts", re: /\b(how many (customers|clients|patients)|new (customers|clients|patients)|customer count|number of (customers|clients))\b|عملاء جدد|عدد العملاء/ },
  { tool: "needs_attention", re: /\b(needs? (my )?attention|what'?s (waiting|pending)|to-?do|what should i do|anything (pending|waiting)|my inbox)\b|ماذا ينتظر|مهامي|المعلق/ },
];

const QUESTION = /\b(how (many|much)|what('?s| is| are| was)?|total|show me|tell me|give me|number of|count)\b|^(revenue|sales|appointments?|unpaid|low stock)\b|كم|ما هي|ما هو|اجمالي|مجموع|\?$|؟$/;

const PERIOD_RE: { period: Period; re: RegExp }[] = [
  { period: "yesterday", re: /\byesterday\b|امس|البارحه/ },
  { period: "last_7_days", re: /\b(last|past) 7 days\b|\b(last|past) week\b|اخر 7 ايام|الاسبوع الماضي/ },
  { period: "this_week", re: /\bthis week\b|\bweekly\b|هذا الاسبوع/ },
  { period: "last_30_days", re: /\b(last|past) 30 days\b|اخر 30 يوم/ },
  { period: "last_month", re: /\blast month\b|\bprevious month\b|الشهر الماضي/ },
  { period: "this_month", re: /\bthis month\b|\bmonthly\b|\bmonth to date\b|هذا الشهر|الشهر الحالي/ },
  { period: "this_year", re: /\bthis year\b|\bytd\b|\byear to date\b|هذه السنه|هذا العام/ },
  { period: "today", re: /\btoday\b|اليوم/ },
];

export function detectPeriod(text: string): Period | undefined {
  const t = normalize(text);
  return PERIOD_RE.find((p) => p.re.test(t))?.period;
}

function suggestionsFor(text: string): string[] {
  return hasArabic(text) ? AR_SUGGESTIONS : DEFAULT_SUGGESTIONS;
}

async function toolReply(tool: ToolName, input: Record<string, unknown>, viewer: AssistantViewer, now: Date): Promise<AssistantReply | null> {
  if (!toolsFor(viewer).some((t) => t.name === tool)) {
    return { text: "Your role doesn't include access to that information. If you need it, ask an owner to update your role.", source: "rules" };
  }
  const r = await runTool(tool, input, viewer, now);
  return { text: r.summary, stats: r.stats, links: r.links, source: "rules" };
}

// ---- engine -------------------------------------------------------------------

export async function answerWithRules(question: string, viewer: AssistantViewer, now: Date = new Date()): Promise<AssistantReply> {
  const raw = question.trim();
  const t = normalize(raw);
  if (!t) return { text: "Ask me anything about the system — where something is, how to do it, or a number you need.", suggestions: suggestionsFor(raw), source: "rules" };

  // 0. Greeting / help
  if (RE.greeting.test(t)) {
    return {
      text:
        "Hi! I'm your Lunia assistant. I can take you to any page, open forms for you, explain how to do things step by step, give you live numbers, and pass an edit request to the owners.",
      suggestions: suggestionsFor(raw),
      source: "rules",
    };
  }

  // 1. Edit requests
  if (RE.myRequests.test(t)) return (await toolReply("my_edit_requests", {}, viewer, now))!;
  if (RE.request.test(t)) {
    const details = raw.replace(/^(please\s+)?(i('d| would) like to\s+)?(request|suggest)\s+(an?\s+)?(edit|change)?\s*[:,-]?\s*/i, "").trim();
    return {
      text: "Sure — describe the change and I'll send it to the owners. You can follow its status here later (“my requests”).",
      requestDraft: { details: details && details.length > 8 && details !== raw ? details : undefined },
      source: "rules",
    };
  }

  const isHowTo = RE.howTo.test(t) && !/\bhow (many|much)\b/.test(t);

  // 2. Numbers
  if (!isHowTo) {
    const metric = METRICS.find((m) => m.re.test(t));
    if (metric && (QUESTION.test(t) || detectPeriod(raw) || t.split(" ").length <= 4)) {
      const period = detectPeriod(raw);
      return (await toolReply(metric.tool, period ? { period } : {}, viewer, now))!;
    }
  }

  // 3. How-to guides
  const guides = matchGuides(raw, viewer);
  if (isHowTo && guides[0]) {
    const best = guides[0];
    return {
      text: best.guide.title,
      guide: guideToView(best.guide),
      links: best.guide.links,
      // Related guides only when they're a strong match (avoid "issue a refund" → "Issue a gift card").
      suggestions: guides.slice(1, 3).filter((g) => g.score >= 0.75).map((g) => g.guide.title),
      source: "rules",
    };
  }

  // 4. Actions (pre-filled forms)
  const find = raw.match(RE.find) ?? normalize(raw).match(RE.find);
  if (find) {
    const query = (find[2] ?? find[3] ?? "").trim();
    if (query.length >= 2) return (await toolReply("find_customer", { query }, viewer, now))!;
  }
  const book = raw.match(RE.book);
  if (book && viewer.permissions.has(PERMISSIONS.BOOKING_MANAGE)) {
    const who = (book[2] ?? book[3] ?? "").trim();
    if (who.length >= 2) {
      const found = await runTool("find_customer", { query: who }, viewer, now);
      const form = found.links.find((l) => l.kind === "form" && l.href.startsWith("/admin/calendar"));
      if (form) return { text: `Opening a walk-in booking for ${found.links[0]!.label} — pick a time and confirm.`, links: [form], navigateTo: form.href, source: "rules" };
      const qs = new URLSearchParams({ add: "1", name: who });
      return { text: `I couldn't find “${who}” as an existing customer, so I've started a walk-in booking with that name — add their phone and pick a time.`, links: [{ label: "New walk-in booking", href: `/admin/calendar?${qs.toString()}`, kind: "form" }], navigateTo: `/admin/calendar?${qs.toString()}`, source: "rules" };
    }
    return { text: "Opening a new walk-in booking — pick the service, a free time and confirm.", links: [{ label: "New walk-in booking", href: "/admin/calendar?add=1", kind: "form" }], navigateTo: "/admin/calendar?add=1", source: "rules" };
  }
  const invoice = raw.match(RE.invoice) ?? normalize(raw).match(RE.invoice);
  if (invoice && viewer.permissions.has(PERMISSIONS.BILLING_MANAGE)) {
    const who = (invoice[1] ?? invoice[2] ?? "").trim();
    if (who.length >= 2) {
      const found = await runTool("find_customer", { query: who }, viewer, now);
      const form = found.links.find((l) => l.kind === "form" && l.href.startsWith("/admin/billing/new"));
      if (form) return { text: `Opening a new invoice for ${found.links[0]!.label}.`, links: [form], navigateTo: form.href, source: "rules" };
      return { text: `No single customer matches “${who}”. Pick one, or start a blank walk-in invoice.`, links: [...found.links.filter((l) => l.kind === "page"), { label: "Blank invoice", href: "/admin/billing/new", kind: "form" }], source: "rules" };
    }
    return { text: "Opening a new invoice — add items, then take the payment.", links: [{ label: "New invoice", href: "/admin/billing/new", kind: "form" }], navigateTo: "/admin/billing/new", source: "rules" };
  }
  if (RE.addLead.test(t) && viewer.permissions.has(PERMISSIONS.CLIENT_MANAGE)) {
    return { text: "Opening the customer roster with the Add lead form ready — fill in the name and phone and save.", links: [{ label: "Add lead", href: "/admin/clients?add=lead", kind: "form" }], navigateTo: "/admin/clients?add=lead", source: "rules" };
  }

  // 5. Navigation
  const dests = matchDestinations(raw, viewer);
  const explicitNav = RE.navVerb.test(t);
  if (dests[0] && (explicitNav || dests[0].score >= 0.75) && !(guides[0] && guides[0].score > dests[0].score)) {
    const best = dests[0];
    return {
      text: explicitNav ? `Opening ${best.label}.` : `${best.label} — here you go.`,
      links: dests.map(toLink),
      navigateTo: explicitNav ? best.href : undefined,
      source: "rules",
    };
  }

  // Loose how-to match (no "how" word, e.g. "refund")
  if (guides[0] && guides[0].score >= 0.6) {
    const best = guides[0];
    return { text: best.guide.title, guide: guideToView(best.guide), links: best.guide.links, source: "rules" };
  }
  if (dests[0]) {
    return { text: "Did you mean one of these?", links: dests.map(toLink), source: "rules" };
  }

  return {
    text: "I'm not sure I understood that. Try asking where something is, how to do a task, or a number (like “unpaid invoices”). If something in the system should change, choose “Request an edit”.",
    suggestions: suggestionsFor(raw),
    source: "rules",
  };
}

export { PERIODS };
