// Customer 360 unified timeline (pure half, safe to import from client
// components — no Prisma): every touchpoint a customer has had with
// the clinic, merged into one newest-first feed. Split in two halves so the
// merge logic is unit-testable without a database:
//
//   assembleTimeline(sources)  -- pure: typed source rows in, sorted entries out
//   pageTimeline(entries, ...) -- pure: kind filter + pagination
//   loadCustomerTimeline(id)   -- DB: batches every source with a small cap
//                                 per source, then calls assembleTimeline
//
// Every entry carries a deep link to the record it summarizes (href), so the
// feed doubles as the navigation hub of the profile.

import type { BookingStatus } from "@prisma/client";

export const TIMELINE_KINDS = [
  "booking",
  "invoice",
  "payment",
  "package",
  "giftcard",
  "loyalty",
  "chat",
  "callback",
  "whatsapp",
  "inquiry",
  "note",
  "lead",
  "consent",
  "treatment",
  "photo",
  "review",
  "waitlist",
] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];

export const TIMELINE_KIND_LABELS: Record<TimelineKind, string> = {
  booking: "Appointments",
  invoice: "Invoices",
  payment: "Payments",
  package: "Packages",
  giftcard: "Gift cards",
  loyalty: "Loyalty",
  chat: "Assistant chats",
  callback: "Call-backs",
  whatsapp: "WhatsApp",
  inquiry: "Inquiries",
  note: "Notes",
  lead: "Pipeline",
  consent: "Consents",
  treatment: "Treatments",
  photo: "Photos",
  review: "Reviews",
  waitlist: "Waitlist",
};

export interface TimelineEntry {
  /** Stable id, unique across kinds: `${kind}:${recordId}`. */
  id: string;
  kind: TimelineKind;
  at: Date;
  /** One-line summary. */
  title: string;
  /** Optional second line (amount, outcome, excerpt). */
  detail?: string;
  /** Deep link to the record, when its module has a route. */
  href?: string;
  /** Status word shown as a pill (booking status, invoice status, ...). */
  status?: string;
  /** Private clinical photo id, rendered as a thumbnail via /admin/clinical/photo/[id]. */
  photoId?: string;
}

// --- Source row shapes (the minimum the merge needs) -------------------------

export interface TimelineSources {
  clientProfileId: string;
  bookings?: { id: string; startAt: Date; status: BookingStatus; serviceName: string; staffName?: string | null; dateISO?: string }[];
  invoices?: { id: string; number: string; kind: string; status: string; totalMinor: number; paidMinor: number; issuedAt: Date | null; createdAt: Date }[];
  payments?: { id: string; invoiceId: string | null; invoiceNumber?: string | null; amountMinor: number; method: string; receivedAt: Date }[];
  packages?: { id: string; packageName: string; sessionsRemaining: number; sessionsTotal: number; createdAt: Date; redemptions?: { id: string; createdAt: Date }[] }[];
  giftCards?: { id: string; code: string; initialMinor: number; balanceMinor: number; createdAt: Date; redemptions?: { id: string; amountMinor: number; createdAt: Date }[] }[];
  loyalty?: { id: string; deltaPoints: number; reason: string; createdAt: Date }[];
  chats?: { id: string; outcome: string | null; createdAt: Date; concerns?: string[] }[];
  callbacks?: { id: string; status: string; outcome: string | null; topic: string | null; createdAt: Date; handledAt: Date | null }[];
  whatsapp?: { id: string; conversationId: string; direction: string; body: string; createdAt: Date }[];
  inquiries?: { id: string; message: string; handled: boolean; createdAt: Date }[];
  notes?: { id: string; body: string; authorName?: string | null; pinned: boolean; createdAt: Date }[];
  leadActivities?: { id: string; kind: string; outcome: string | null; body: string | null; authorName?: string | null; createdAt: Date }[];
  consents?: { id: string; title: string; version: number; signedAt: Date }[];
  treatments?: { id: string; serviceName: string | null; performedByName: string; performedAt: Date; skinReaction?: string | null }[];
  photos?: { id: string; kind: string; area: string | null; takenAt: Date }[];
  reviews?: { id: string; rating: number; status: string; createdAt: Date; title?: string | null }[];
  waitlist?: { id: string; serviceName: string; desiredDateISO: string; status: string; createdAt: Date }[];
}

const money = (minor: number) => `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} SAR`;
const excerpt = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const words = (s: string) => s.replace(/_/g, " ").toLowerCase();

/** Merges every source into one newest-first list. Pure; safe to unit test. */
export function assembleTimeline(src: TimelineSources): TimelineEntry[] {
  const cid = src.clientProfileId;
  const out: TimelineEntry[] = [];

  for (const b of src.bookings ?? []) {
    out.push({
      id: `booking:${b.id}`,
      kind: "booking",
      at: b.startAt,
      title: b.serviceName,
      detail: b.staffName ? `with ${b.staffName}` : undefined,
      status: b.status,
      href: b.dateISO ? `/admin/calendar?day=${b.dateISO}` : undefined,
    });
  }

  for (const inv of src.invoices ?? []) {
    const isCredit = inv.kind === "CREDIT_NOTE";
    out.push({
      id: `invoice:${inv.id}`,
      kind: "invoice",
      at: inv.issuedAt ?? inv.createdAt,
      title: isCredit ? `Credit note ${inv.number}` : inv.status === "DRAFT" ? "Draft invoice" : `Invoice ${inv.number}`,
      detail: `${isCredit ? "−" : ""}${money(inv.totalMinor)}${!isCredit && inv.status !== "DRAFT" && inv.paidMinor < inv.totalMinor && inv.status !== "VOID" ? ` · ${money(inv.totalMinor - inv.paidMinor)} outstanding` : ""}`,
      status: inv.status,
      href: `/admin/billing/${inv.id}`,
    });
  }

  for (const p of src.payments ?? []) {
    const refund = p.amountMinor < 0;
    out.push({
      id: `payment:${p.id}`,
      kind: "payment",
      at: p.receivedAt,
      title: `${refund ? "Refund" : "Payment"} ${money(Math.abs(p.amountMinor))}`,
      detail: `${words(p.method)}${p.invoiceNumber ? ` · ${p.invoiceNumber}` : ""}`,
      href: p.invoiceId ? `/admin/billing/${p.invoiceId}` : undefined,
    });
  }

  for (const pk of src.packages ?? []) {
    out.push({
      id: `package:${pk.id}`,
      kind: "package",
      at: pk.createdAt,
      title: `Package purchased: ${pk.packageName}`,
      detail: `${pk.sessionsTotal} sessions`,
      href: `/admin/clients/${cid}?tab=credits`,
    });
    for (const r of pk.redemptions ?? []) {
      out.push({
        id: `package:${pk.id}:${r.id}`,
        kind: "package",
        at: r.createdAt,
        title: `Package session used: ${pk.packageName}`,
        href: `/admin/clients/${cid}?tab=credits`,
      });
    }
  }

  for (const g of src.giftCards ?? []) {
    out.push({
      id: `giftcard:${g.id}`,
      kind: "giftcard",
      at: g.createdAt,
      title: `Gift card ${g.code} issued`,
      detail: money(g.initialMinor),
      href: `/admin/clients/${cid}?tab=credits`,
    });
    for (const r of g.redemptions ?? []) {
      out.push({
        id: `giftcard:${g.id}:${r.id}`,
        kind: "giftcard",
        at: r.createdAt,
        title: `Gift card ${g.code} redeemed`,
        detail: money(r.amountMinor),
        href: `/admin/clients/${cid}?tab=credits`,
      });
    }
  }

  for (const t of src.loyalty ?? []) {
    out.push({
      id: `loyalty:${t.id}`,
      kind: "loyalty",
      at: t.createdAt,
      title: `${t.deltaPoints > 0 ? "+" : ""}${t.deltaPoints} pts`,
      detail: words(t.reason),
      href: `/admin/clients/${cid}?tab=loyalty`,
    });
  }

  for (const c of src.chats ?? []) {
    out.push({
      id: `chat:${c.id}`,
      kind: "chat",
      at: c.createdAt,
      title: "Website assistant chat",
      detail: c.concerns?.length ? c.concerns.join(", ") : undefined,
      status: c.outcome ?? "IN_PROGRESS",
      href: `/admin/assistant/${c.id}`,
    });
  }

  for (const cb of src.callbacks ?? []) {
    out.push({
      id: `callback:${cb.id}`,
      kind: "callback",
      at: cb.handledAt ?? cb.createdAt,
      title: cb.handledAt ? "Call-back handled" : "Call-back requested",
      detail: [cb.topic, cb.outcome ? words(cb.outcome) : null].filter(Boolean).join(" · ") || undefined,
      status: cb.status,
      href: `/admin/callbacks${cb.handledAt ? "?view=done" : ""}`,
    });
  }

  for (const m of src.whatsapp ?? []) {
    out.push({
      id: `whatsapp:${m.id}`,
      kind: "whatsapp",
      at: m.createdAt,
      title: m.direction === "OUT" ? "WhatsApp sent" : "WhatsApp received",
      detail: excerpt(m.body),
      href: `/admin/whatsapp?c=${m.conversationId}`,
    });
  }

  for (const q of src.inquiries ?? []) {
    out.push({
      id: `inquiry:${q.id}`,
      kind: "inquiry",
      at: q.createdAt,
      title: "Website inquiry",
      detail: excerpt(q.message),
      status: q.handled ? "HANDLED" : "OPEN",
      href: `/admin/inquiries/${q.id}`,
    });
  }

  for (const n of src.notes ?? []) {
    out.push({
      id: `note:${n.id}`,
      kind: "note",
      at: n.createdAt,
      title: `${n.pinned ? "Pinned note" : "Note"}${n.authorName ? ` by ${n.authorName}` : ""}`,
      detail: excerpt(n.body),
      href: `/admin/clients/${cid}?tab=notes`,
    });
  }

  for (const a of src.leadActivities ?? []) {
    out.push({
      id: `lead:${a.id}`,
      kind: "lead",
      at: a.createdAt,
      title: `${words(a.kind).replace(/^\w/, (c) => c.toUpperCase())}${a.authorName ? ` by ${a.authorName}` : ""}`,
      detail: [a.outcome ? words(a.outcome) : null, a.body ? excerpt(a.body) : null].filter(Boolean).join(" · ") || undefined,
      href: `/admin/clients/${cid}?tab=pipeline`,
    });
  }

  for (const s of src.consents ?? []) {
    out.push({
      id: `consent:${s.id}`,
      kind: "consent",
      at: s.signedAt,
      title: `Consent signed: ${s.title}`,
      detail: `v${s.version}`,
      href: `/admin/clients/${cid}/clinical/consent/${s.id}`,
    });
  }

  for (const t of src.treatments ?? []) {
    out.push({
      id: `treatment:${t.id}`,
      kind: "treatment",
      at: t.performedAt,
      title: `Treatment: ${t.serviceName ?? "session"}`,
      detail: [`by ${t.performedByName}`, t.skinReaction ? `reaction: ${t.skinReaction}` : null].filter(Boolean).join(" · "),
      href: `/admin/clients/${cid}/clinical/treatment/${t.id}`,
    });
  }

  for (const p of src.photos ?? []) {
    out.push({
      id: `photo:${p.id}`,
      kind: "photo",
      at: p.takenAt,
      title: `${words(p.kind).replace(/^\w/, (c) => c.toUpperCase())} photo${p.area ? ` · ${p.area}` : ""}`,
      href: `/admin/clients/${cid}/clinical/photos`,
      photoId: p.id,
    });
  }

  for (const r of src.reviews ?? []) {
    out.push({
      id: `review:${r.id}`,
      kind: "review",
      at: r.createdAt,
      title: r.rating > 0 ? `Review: ${r.rating}/5${r.title ? ` · ${r.title}` : ""}` : "Review requested",
      status: r.rating > 0 ? r.status : "AWAITING",
      href: "/admin/reviews",
    });
  }

  for (const w of src.waitlist ?? []) {
    out.push({
      id: `waitlist:${w.id}`,
      kind: "waitlist",
      at: w.createdAt,
      title: `Joined waitlist: ${w.serviceName}`,
      detail: `for ${w.desiredDateISO}`,
      status: w.status,
      href: `/admin/waitlist?status=${w.status}`,
    });
  }

  // Newest first; ties broken by id so the order is deterministic.
  out.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));
  return out;
}

export interface TimelinePage {
  entries: TimelineEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Kind filter + 1-based pagination over an assembled feed. Pure. */
export function pageTimeline(entries: TimelineEntry[], opts: { page?: number; pageSize?: number; kinds?: TimelineKind[] } = {}): TimelinePage {
  const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 200);
  const page = Math.max(opts.page ?? 1, 1);
  const kinds = opts.kinds && opts.kinds.length > 0 ? new Set(opts.kinds) : null;
  const filtered = kinds ? entries.filter((e) => kinds.has(e.kind)) : entries;
  const start = (page - 1) * pageSize;
  return {
    entries: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
    hasMore: start + pageSize < filtered.length,
  };
}
