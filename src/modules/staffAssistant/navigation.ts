// "Take me there": matches a request to an admin page or a quick action the
// viewer is allowed to open (same permission + hidden-menu filtering as the
// sidebar), using English labels, palette keywords, Arabic labels and extra
// synonyms staff actually type.

import { paletteActionsFor, visibleNavItems } from "@/app/admin/_components/navCatalog";
import { st } from "@/app/admin/_i18n/staffLocale";
import { matchScore } from "./text";
import type { AssistantLink, AssistantViewer } from "./types";

// Extra ways people refer to pages (English + Arabic), keyed by href.
const SYNONYMS: Record<string, string[]> = {
  "/admin": ["home", "today", "dashboard", "start", "الرئيسيه", "اليوم"],
  "/admin/dashboard": ["analytics", "kpi", "business numbers", "تحليلات", "ارقام"],
  "/admin/reports": ["report", "export", "csv", "تقرير", "تصدير"],
  "/admin/clients": ["clients", "patients", "roster", "customer list", "عملاء", "مرضى", "زبائن"],
  "/admin/leads": ["pipeline", "prospects", "sales board", "عملاء محتملين", "مسار المبيعات"],
  "/admin/callbacks": ["call back", "callback", "calls", "اتصال", "مكالمات"],
  "/admin/calendar": ["appointments", "schedule", "bookings", "agenda", "مواعيد", "حجوزات", "جدول"],
  "/admin/waitlist": ["waiting list", "انتظار"],
  "/admin/billing": ["invoice", "invoices", "payments", "bills", "pos", "cashier", "فواتير", "فاتوره", "مدفوعات", "دفع"],
  "/admin/accounting": ["cash drawer", "books", "محاسبه", "صندوق"],
  "/admin/accounting/expenses": ["expense", "costs", "مصروف", "مصاريف"],
  "/admin/inventory": ["stock", "products", "items", "منتجات", "مخزون"],
  "/admin/inventory/purchase-orders": ["po", "purchase order", "order stock", "طلب شراء"],
  "/admin/inventory/suppliers": ["vendors", "supplier", "موردين"],
  "/admin/me": ["clock in", "clock out", "my leave", "attendance", "حضور", "انصراف", "اجازتي"],
  "/admin/hr": ["staff", "employees", "hr", "موظفين", "الموارد البشريه"],
  "/admin/hr/attendance": ["timesheet", "attendance", "حضور"],
  "/admin/hr/leave": ["vacation", "time off", "leave", "اجازات", "اجازه"],
  "/admin/hr/payroll": ["salaries", "salary", "payslips", "رواتب", "راتب"],
  "/admin/memberships": ["memberships", "members", "subscriptions", "plans", "club", "عضويات", "اشتراكات"],
  "/admin/commerce": ["gift card", "gift cards", "packages", "vouchers", "بطاقات هدايا", "باقات"],
  "/admin/tiers": ["loyalty", "membership", "points", "ولاء", "عضويه", "نقاط"],
  "/admin/marketing/campaigns": ["campaign", "ads", "حمله", "حملات"],
  "/admin/comms/broadcast": ["broadcast", "bulk message", "send message to customers", "رسائل جماعيه"],
  "/admin/whatsapp": ["whatsapp inbox", "chats", "messages", "واتساب", "رسائل"],
  "/admin/inquiries": ["contact form", "inquiry", "enquiries", "استفسار", "استفسارات"],
  "/admin/reviews": ["review", "ratings", "feedback", "تقييم", "تقييمات"],
  "/admin/media": ["images", "photos library", "uploads", "صور", "وسائط"],
  "/admin/content": ["website content", "cms", "home page", "محتوى الموقع"],
  "/admin/catalog": ["services", "departments", "brands", "blog", "خدمات", "اقسام", "علامات"],
  "/admin/settings": ["settings", "configuration", "opening hours", "اعدادات", "ساعات العمل"],
  "/admin/comms": ["communications", "message log", "templates", "اتصالات", "قوالب"],
  "/admin/users": ["team", "team members", "staff accounts", "فريق", "مستخدمين"],
  "/admin/roles": ["permissions", "access", "صلاحيات", "ادوار"],
  "/admin/audit": ["audit", "history log", "who changed", "سجل"],
  "/admin/notifications": ["alerts", "inbox", "تنبيهات", "اشعارات"],
};

// Sub-pages that aren't in the sidebar but people ask for directly.
const EXTRA_PAGES: { href: string; label: string; anyHref: string; phrases: string[] }[] = [
  { href: "/admin/billing/new", label: "New invoice", anyHref: "/admin/billing", phrases: ["new invoice", "checkout", "walk-in sale", "فاتوره جديده", "دفع"] },
  { href: "/admin/inventory/stock-take", label: "Stock-take", anyHref: "/admin/inventory", phrases: ["stock take", "stocktake", "count stock", "جرد"] },
  { href: "/admin/inventory/purchase-orders/new?suggest=1", label: "Reorder low stock", anyHref: "/admin/inventory", phrases: ["reorder", "draft po", "اعاده طلب"] },
  { href: "/admin/comms/templates", label: "Message templates", anyHref: "/admin/comms", phrases: ["message templates", "whatsapp templates", "sms templates", "قوالب الرسائل"] },
  { href: "/admin/catalog/services", label: "Services", anyHref: "/admin/catalog", phrases: ["services", "treatments", "prices", "خدمات", "اسعار"] },
  { href: "/admin/catalog/journal", label: "Blog", anyHref: "/admin/catalog", phrases: ["blog", "journal", "articles", "مدونه", "مقالات"] },
  { href: "/admin/clinical/consents", label: "Consent forms", anyHref: "/admin/clinical/consents", phrases: ["consent", "consent forms", "waiver", "موافقه", "اقرار"] },
  { href: "/admin/booking/rooms", label: "Rooms", anyHref: "/admin/booking/rooms", phrases: ["rooms", "غرف"] },
  { href: "/admin/booking/schedules", label: "Schedules", anyHref: "/admin/booking/schedules", phrases: ["staff schedule", "working hours", "shifts", "جدول الموظفين", "دوام"] },
  { href: "/admin/requests", label: "Edit requests", anyHref: "/admin/requests", phrases: ["edit requests", "change requests", "requests inbox", "طلبات التعديل"] },
];

export interface NavCandidate {
  href: string;
  label: string;
  kind: "page" | "form";
  phrases: string[];
}

export function navCandidates(viewer: AssistantViewer): NavCandidate[] {
  const items = visibleNavItems(viewer.permissions, viewer.hiddenHrefs ?? []);
  const allowed = new Set(items.map((i) => i.href));
  const out: NavCandidate[] = items.map((i) => ({
    href: i.href,
    label: i.label,
    kind: "page" as const,
    phrases: [i.label, i.keywords ?? "", st(i.label, "ar"), ...(SYNONYMS[i.href] ?? [])].filter(Boolean),
  }));
  for (const p of EXTRA_PAGES) {
    if (allowed.has(p.anyHref)) out.push({ href: p.href, label: p.label, kind: p.href.includes("/new") ? "form" : "page", phrases: [p.label, ...p.phrases] });
  }
  for (const a of paletteActionsFor(viewer.permissions, allowed)) {
    if (a.href === "/") continue; // "Open website" isn't an admin destination
    out.push({ href: a.href, label: a.label, kind: "form", phrases: [a.label, a.keywords ?? "", st(a.label, "ar")].filter(Boolean) });
  }
  return out;
}

/** Best matching destinations for a request (highest score first). */
export function matchDestinations(query: string, viewer: AssistantViewer, limit = 3): (NavCandidate & { score: number })[] {
  return navCandidates(viewer)
    .map((c) => ({ ...c, score: matchScore(query, c.phrases) }))
    .filter((c) => c.score >= 0.5)
    .sort((a, b) => b.score - a.score || a.href.length - b.href.length)
    .slice(0, limit);
}

export function toLink(c: NavCandidate): AssistantLink {
  return { label: c.label, href: c.href, kind: c.kind };
}
