// Whole-system search: customers/leads, bookings, invoices, products,
// employees, inquiries, WhatsApp threads, chat sessions and call-backs.
// Read-only. Every group is gated on the viewer's permissions HERE (not only
// in the calling page) so the command palette's server action can't leak a
// group the sidebar would hide. Each hit carries a link to the record.

import { prisma } from "@/lib/db";
import type { PermissionKey } from "@/modules/iam/permissions";
import { utcToCenterLocal, centerLocalToUtc } from "@/modules/booking/availability";

export {
  SEARCH_GROUPS,
  SEARCH_GROUP_LABELS,
  SEARCH_GROUP_PERMISSION,
  emptySearchResult,
  searchTotal,
  type SearchHit,
  type SearchGroupKey,
  type GlobalSearchResult,
} from "./groups";
import { SEARCH_GROUP_PERMISSION, emptySearchResult, type SearchGroupKey, type GlobalSearchResult } from "./groups";

const LIMIT = 8;
const CENTER_TZ = "Asia/Riyadh";
const whenFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function emptySearchResult(): GlobalSearchResult {
  return Object.fromEntries(SEARCH_GROUPS.map((g) => [g, [] as SearchHit[]])) as unknown as GlobalSearchResult;
}

export function searchTotal(result: GlobalSearchResult): number {
  return SEARCH_GROUPS.reduce((sum, g) => sum + result[g].length, 0);
}

function formatSar(minor: number): string {
  return `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
}

/**
 * Searches every group the viewer may see. `permissions` omitted = every
 * group (only for trusted internal callers/tests); pages and actions must
 * always pass the viewer's set.
 */
export async function globalSearch(query: string, permissions?: Set<PermissionKey>): Promise<GlobalSearchResult> {
  const result = emptySearchResult();
  const q = query.trim();
  if (q.length < 2) return result;
  const can = (g: SearchGroupKey) => !permissions || permissions.has(SEARCH_GROUP_PERMISSION[g]);
  const contains = { contains: q, mode: "insensitive" as const };
  // Phones are stored normalized; match on the digits the user typed.
  const digits = q.replace(/[^\d]/g, "");
  const phoneContains = digits.length >= 3 ? { contains: digits } : null;
  const todayStart = centerLocalToUtc(utcToCenterLocal(new Date()).dateISO, 0);
  const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);

  const tasks: Promise<void>[] = [];

  if (can("customers")) {
    tasks.push(
      prisma.clientProfile
        .findMany({
          where: {
            OR: [{ fullName: contains }, { user: { email: contains } }, { user: { phone: phoneContains ?? contains } }],
          },
          include: { user: { select: { phone: true, email: true } } },
          take: LIMIT,
          orderBy: { fullName: "asc" },
        })
        .then((rows) => {
          result.customers = rows.map((c) => ({
            id: c.id,
            title: c.fullName || "Unnamed customer",
            subtitle: c.user.phone ?? c.user.email ?? undefined,
            href: `/admin/clients/${c.id}`,
            badge: c.stage,
          }));
        }),
    );
  }

  if (can("bookings")) {
    // Today's and upcoming appointments for a matching customer, soonest first.
    tasks.push(
      prisma.appointment
        .findMany({
          where: {
            startAt: { gte: todayStart },
            booking: {
              status: { notIn: ["CANCELLED", "NO_SHOW"] },
              client: { OR: [{ fullName: contains }, ...(phoneContains ? [{ user: { phone: phoneContains } }] : [])] },
            },
          },
          include: { booking: { include: { client: { select: { id: true, fullName: true } } } }, service: { select: { nameEn: true } } },
          orderBy: { startAt: "asc" },
          take: LIMIT,
        })
        .then((rows) => {
          result.bookings = rows.map((a) => ({
            id: a.id,
            title: `${a.booking.client.fullName || "Customer"} — ${a.service.nameEn}`,
            subtitle: whenFmt.format(a.startAt),
            href: `/admin/calendar?day=${utcToCenterLocal(a.startAt).dateISO}`,
            badge: a.booking.status === "CHECKED_IN" ? "Checked in" : a.startAt < tomorrowStart ? "Today" : undefined,
          }));
        }),
    );
  }

  if (can("invoices")) {
    tasks.push(
      prisma.invoice
        .findMany({
          where: { OR: [{ number: contains }, { customerName: contains }, ...(phoneContains ? [{ customerPhone: phoneContains }] : [])] },
          orderBy: [{ issuedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
          take: LIMIT,
          select: { id: true, number: true, customerName: true, status: true, totalMinor: true },
        })
        .then((rows) => {
          result.invoices = rows.map((i) => ({
            id: i.id,
            title: `${i.number} — ${i.customerName}`,
            subtitle: formatSar(i.totalMinor),
            href: `/admin/billing/${i.id}`,
            badge: i.status === "PARTIALLY_PAID" ? "Part-paid" : titleCase(i.status),
          }));
        }),
    );
  }

  if (can("products")) {
    tasks.push(
      prisma.product
        .findMany({
          where: { OR: [{ nameEn: contains }, { nameAr: contains }, { sku: contains }, { barcode: contains }, { brandName: contains }] },
          orderBy: { nameEn: "asc" },
          take: LIMIT,
          select: { id: true, nameEn: true, sku: true, barcode: true, stockQty: true, unit: true, reorderLevel: true, isActive: true },
        })
        .then((rows) => {
          result.products = rows.map((p) => ({
            id: p.id,
            title: p.nameEn,
            subtitle: [p.sku ? `SKU ${p.sku}` : null, p.barcode ? `Barcode ${p.barcode}` : null, `${p.stockQty} ${p.unit} on hand`].filter(Boolean).join(" · "),
            href: `/admin/inventory/products/${p.id}`,
            badge: !p.isActive ? "Inactive" : p.stockQty <= p.reorderLevel ? "Low stock" : undefined,
          }));
        }),
    );
  }

  if (can("employees")) {
    tasks.push(
      prisma.user
        .findMany({
          where: {
            type: "STAFF",
            OR: [{ staffProfile: { fullName: contains } }, { email: contains }, { employeeRecord: { employeeNo: contains } }, { employeeRecord: { jobTitle: contains } }],
          },
          include: { staffProfile: { select: { fullName: true, title: true } }, employeeRecord: { select: { jobTitle: true, employeeNo: true } } },
          take: LIMIT,
        })
        .then((rows) => {
          result.employees = rows.map((u) => ({
            id: u.id,
            title: u.staffProfile?.fullName || u.email || "Staff",
            subtitle: [u.employeeRecord?.jobTitle ?? u.staffProfile?.title, u.employeeRecord?.employeeNo].filter(Boolean).join(" · ") || u.email || undefined,
            href: `/admin/hr/${u.id}`,
            badge: u.isActive ? undefined : "Inactive",
          }));
        }),
    );
  }

  if (can("inquiries")) {
    tasks.push(
      prisma.contactInquiry
        .findMany({ where: { OR: [{ name: contains }, { phone: contains }, { message: contains }] }, take: LIMIT, orderBy: { createdAt: "desc" } })
        .then((rows) => {
          result.inquiries = rows.map((i) => ({
            id: i.id,
            title: i.name,
            subtitle: i.phone,
            href: `/admin/inquiries/${i.id}`,
            badge: i.handled ? "Handled" : "New",
          }));
        }),
    );
  }

  if (can("conversations")) {
    tasks.push(
      prisma.whatsappConversation
        .findMany({
          where: { OR: [{ phone: contains }, { client: { fullName: contains } }] },
          include: { client: { select: { fullName: true } } },
          take: LIMIT,
          orderBy: { lastMessageAt: "desc" },
        })
        .then((rows) => {
          result.conversations = rows.map((c) => ({
            id: c.id,
            title: c.client?.fullName || c.phone,
            subtitle: c.lastMessagePreview ?? undefined,
            href: `/admin/whatsapp?c=${c.id}`,
            badge: c.unread ? "Unread" : undefined,
          }));
        }),
    );
  }

  if (can("chats")) {
    tasks.push(
      prisma.chatSession
        .findMany({
          where: { NOT: { state: "start" }, OR: [{ name: contains }, { phone: contains }, { email: contains }] },
          take: LIMIT,
          orderBy: { createdAt: "desc" },
          select: { id: true, name: true, phone: true, outcome: true, createdAt: true },
        })
        .then((rows) => {
          result.chats = rows.map((c) => ({
            id: c.id,
            title: c.name || c.phone || "Anonymous visitor",
            subtitle: whenFmt.format(c.createdAt),
            href: `/admin/assistant/${c.id}`,
            badge: c.outcome ? titleCase(c.outcome) : "In progress",
          }));
        }),
    );
  }

  if (can("callbacks")) {
    tasks.push(
      prisma.callbackRequest
        .findMany({
          where: { OR: [{ name: contains }, { phone: contains }, { topic: contains }] },
          take: LIMIT,
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          select: { id: true, name: true, phone: true, topic: true, status: true },
        })
        .then((rows) => {
          result.callbacks = rows.map((c) => ({
            id: c.id,
            title: c.name,
            subtitle: [c.phone, c.topic].filter(Boolean).join(" · "),
            href: "/admin/callbacks",
            badge: c.status === "NO_ANSWER" ? "No answer" : titleCase(c.status),
          }));
        }),
    );
  }

  await Promise.all(tasks);
  return result;
}
