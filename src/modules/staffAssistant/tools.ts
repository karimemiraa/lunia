// Read-only, permission-checked data tools for the staff assistant. The SAME
// tools serve the built-in rule engine and a connected AI provider (as
// tool-use functions), so every number the assistant gives comes straight
// from the database — never from the model's imagination — and nobody sees
// data their role can't already see in the admin.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { PERMISSIONS, type PermissionKey } from "@/modules/iam/permissions";
import { NOT_TEST_CLIENT } from "@/modules/crm/testCustomers";
import { lowStockWhere } from "@/modules/inventory/products";
import { bookingStatsForRanges } from "@/modules/booking/stats";
import { getNotificationFeed } from "@/modules/notifications/feed";
import { NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPE_HREF, type NotificationType } from "@/modules/notifications/types";
import { listMyEditRequests } from "@/modules/editRequests/editRequests";
import { receivablesAging } from "@/modules/accounting/reports";
import { staffPerformanceReport } from "@/modules/reports/teamReports";
import { PERIODS, periodRange, formatSar, type Period } from "./periods";
import type { AssistantLink, AssistantStat, AssistantViewer } from "./types";

export interface ToolResult {
  title: string;
  stats: AssistantStat[];
  links: AssistantLink[];
  /** One-sentence answer the rule engine shows verbatim. */
  summary: string;
}

export interface AssistantTool<I extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  /** Shown to an AI provider so it knows when to call the tool. */
  description: string;
  /** The viewer needs at least ONE of these (empty = any staff member). */
  anyOf: PermissionKey[];
  input: I;
  run: (input: z.output<I>, viewer: AssistantViewer, now: Date) => Promise<ToolResult>;
}

const periodInput = z.object({ period: z.enum(PERIODS).default("today") });

function defineTool<I extends z.ZodTypeAny>(tool: AssistantTool<I>): AssistantTool<I> {
  return tool;
}

export function canUseTool(tool: AssistantTool, viewer: AssistantViewer): boolean {
  return tool.anyOf.length === 0 || tool.anyOf.some((p) => viewer.permissions.has(p));
}

const n = (v: number) => v.toLocaleString("en-US");

export const TOOLS = [
  defineTool({
    name: "revenue_summary",
    description:
      "Money for a period in Riyadh time: cash collected (completed payments, net of refunds), payment count, invoiced total (issued invoices minus credit notes) and realized booking revenue (completed visits).",
    anyOf: [PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.BILLING_MANAGE, PERMISSIONS.ACCOUNTING_MANAGE],
    input: periodInput,
    async run({ period }, _viewer, now) {
      const { from, to, label } = periodRange(period as Period, now);
      const [payments, invoiced, [stats]] = await Promise.all([
        prisma.payment.aggregate({ where: { status: "COMPLETED", receivedAt: { gte: from, lt: to } }, _sum: { amountMinor: true }, _count: true }),
        prisma.invoice.groupBy({ by: ["kind"], where: { issuedAt: { gte: from, lt: to }, status: { notIn: ["DRAFT", "VOID"] } }, _sum: { totalMinor: true } }),
        bookingStatsForRanges([{ from, to }]),
      ]);
      const collected = payments._sum.amountMinor ?? 0;
      const sum = (kind: string) => invoiced.find((g) => g.kind === kind)?._sum.totalMinor ?? 0;
      const invoicedNet = sum("INVOICE") - sum("CREDIT_NOTE");
      return {
        title: `Revenue — ${label}`,
        stats: [
          { label: "Collected (net of refunds)", value: formatSar(collected) },
          { label: "Payments", value: n(payments._count) },
          { label: "Invoiced", value: formatSar(invoicedNet) },
          { label: "Completed-visit revenue", value: formatSar(stats!.revenueMinor) },
        ],
        links: [
          { label: "Invoices & payments", href: "/admin/billing", kind: "page" },
          { label: "Business dashboard", href: "/admin/dashboard", kind: "page" },
        ],
        summary: `${label}: ${formatSar(collected)} collected from ${n(payments._count)} payment${payments._count === 1 ? "" : "s"}; ${formatSar(invoicedNet)} invoiced.`,
      };
    },
  }),
  defineTool({
    name: "appointments_summary",
    description: "Appointments whose visit time falls in a period (Riyadh time), broken down by status (confirmed, checked in, completed, cancelled, no-show).",
    anyOf: [PERMISSIONS.BOOKING_VIEW, PERMISSIONS.BOOKING_MANAGE],
    input: periodInput,
    async run({ period }, _viewer, now) {
      const { from, to, label } = periodRange(period as Period, now);
      const rows = await prisma.appointment.findMany({
        where: { startAt: { gte: from, lt: to }, booking: { client: NOT_TEST_CLIENT } },
        select: { booking: { select: { status: true } } },
      });
      const by = new Map<string, number>();
      for (const r of rows) by.set(r.booking.status, (by.get(r.booking.status) ?? 0) + 1);
      const order = ["REQUESTED", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"];
      const pretty = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ");
      return {
        title: `Appointments — ${label}`,
        stats: [{ label: "Total", value: n(rows.length) }, ...order.filter((s) => by.has(s)).map((s) => ({ label: pretty(s), value: n(by.get(s)!) }))],
        links: [{ label: "Open the calendar", href: "/admin/calendar", kind: "page" }],
        summary: `${label}: ${n(rows.length)} appointment${rows.length === 1 ? "" : "s"}${by.get("NO_SHOW") ? `, ${n(by.get("NO_SHOW")!)} no-show${by.get("NO_SHOW") === 1 ? "" : "s"}` : ""}${by.get("CANCELLED") ? `, ${n(by.get("CANCELLED")!)} cancelled` : ""}.`,
      };
    },
  }),
  defineTool({
    name: "bookings_made",
    description: "Bookings CREATED in a period (acquisition, not visit date): total, new-client vs returning bookings, and the top services by revenue.",
    anyOf: [PERMISSIONS.ANALYTICS_VIEW],
    input: periodInput,
    async run({ period }, _viewer, now) {
      const { from, to, label } = periodRange(period as Period, now);
      const [s] = await bookingStatsForRanges([{ from, to }]);
      const top = s!.byService.slice(0, 3);
      return {
        title: `Bookings made — ${label}`,
        stats: [
          { label: "Bookings", value: n(s!.totalBookings) },
          { label: "New-client bookings", value: n(s!.newClients) },
          { label: "Returning", value: n(s!.returningBookings) },
          ...top.map((t, i) => ({ label: `Top service ${i + 1}`, value: `${t.name} (${n(t.bookings)})` })),
        ],
        links: [{ label: "Business dashboard", href: "/admin/dashboard", kind: "page" }],
        summary: `${label}: ${n(s!.totalBookings)} booking${s!.totalBookings === 1 ? "" : "s"} made (${n(s!.newClients)} from new clients).`,
      };
    },
  }),
  defineTool({
    name: "staff_performance",
    description:
      "Per staff member for a period (Riyadh time): completed visits, revenue (completed appointments), no-show rate and utilisation (booked ÷ scheduled hours). Same figures as the Staff performance report.",
    anyOf: [PERMISSIONS.ANALYTICS_VIEW],
    input: z.object({ period: z.enum(PERIODS).default("this_month") }),
    async run({ period }, _viewer, now) {
      const { from, to, label } = periodRange(period as Period, now);
      const { rows } = await staffPerformanceReport({ from, to });
      const top = rows.filter((r) => r.appointments > 0).slice(0, 5);
      return {
        title: `Staff performance — ${label}`,
        stats: top.map((r) => ({ label: r.staff, value: `${r.revenueSAR} SAR · ${r.completed} visits${r.utilisation ? ` · ${r.utilisation} booked` : ""}` })),
        links: [{ label: "Staff performance report", href: `/admin/reports?type=staff`, kind: "page" }],
        summary: top.length ? `${label}: ${top[0]!.staff} leads with ${top[0]!.revenueSAR} SAR from ${top[0]!.completed} completed visit${top[0]!.completed === 1 ? "" : "s"}.` : `${label}: no appointments yet.`,
      };
    },
  }),
  defineTool({
    name: "unpaid_invoices",
    description:
      "Open invoices awaiting payment (issued or partially paid) and the total outstanding balance — net of payments and of credit notes issued against them, same as the Accounting receivables report.",
    anyOf: [PERMISSIONS.BILLING_MANAGE],
    input: z.object({}),
    async run(_input, _viewer, now) {
      // The accounting module's own receivables calc, so the numbers always match its report.
      const aging = await receivablesAging(now);
      const count = aging.rows.length;
      const oldest = aging.rows.reduce((max, r) => Math.max(max, r.ageDays), 0);
      return {
        title: "Unpaid invoices",
        stats: [
          { label: "Open invoices", value: n(count) },
          { label: "Outstanding", value: formatSar(aging.totalMinor) },
          ...(count ? [{ label: "Oldest", value: `${n(oldest)} day${oldest === 1 ? "" : "s"}` }] : []),
        ],
        links: [{ label: "Show unpaid invoices", href: "/admin/billing?status=ISSUED", kind: "page" }],
        summary: count ? `${n(count)} invoice${count === 1 ? "" : "s"} awaiting payment, ${formatSar(aging.totalMinor)} outstanding.` : "No invoices are awaiting payment.",
      };
    },
  }),
  defineTool({
    name: "low_stock",
    description: "Active products at or below their reorder level (or negative stock), with the most urgent items.",
    anyOf: [PERMISSIONS.INVENTORY_MANAGE],
    input: z.object({}),
    async run() {
      const where = { AND: [lowStockWhere(), { isActive: true }] };
      const [count, items] = await Promise.all([
        prisma.product.count({ where }),
        prisma.product.findMany({ where, orderBy: { stockQty: "asc" }, take: 5, select: { id: true, nameEn: true, stockQty: true, unit: true, reorderLevel: true } }),
      ]);
      return {
        title: "Low stock",
        stats: [{ label: "Products to reorder", value: n(count) }, ...items.map((p) => ({ label: p.nameEn, value: `${n(p.stockQty)} ${p.unit} (reorder at ${n(p.reorderLevel)})` }))],
        links: [
          { label: "Low-stock products", href: "/admin/inventory?low=1", kind: "page" },
          { label: "Draft a reorder", href: "/admin/inventory/purchase-orders/new?suggest=1", kind: "form" },
        ],
        summary: count ? `${n(count)} product${count === 1 ? " is" : "s are"} at or below the reorder level.` : "Nothing is low on stock.",
      };
    },
  }),
  defineTool({
    name: "customer_counts",
    description: "Customer totals: all customers, and how many new customers were added in a period (Riyadh time). Test customers excluded.",
    anyOf: [PERMISSIONS.CLIENT_VIEW, PERMISSIONS.ANALYTICS_VIEW],
    input: z.object({ period: z.enum(PERIODS).default("this_month") }),
    async run({ period }, _viewer, now) {
      const { from, to, label } = periodRange(period as Period, now);
      const [total, added] = await Promise.all([
        prisma.clientProfile.count({ where: NOT_TEST_CLIENT }),
        prisma.clientProfile.count({ where: { ...NOT_TEST_CLIENT, createdAt: { gte: from, lt: to } } }),
      ]);
      return {
        title: "Customers",
        stats: [
          { label: "All customers", value: n(total) },
          { label: `New — ${label.toLowerCase()}`, value: n(added) },
        ],
        links: [{ label: "Customer roster", href: "/admin/clients", kind: "page" }],
        summary: `${n(total)} customers in total; ${n(added)} new ${label.toLowerCase()}.`,
      };
    },
  }),
  defineTool({
    name: "find_customer",
    description: "Find customers by name, phone or email (up to 5) with links to their profile and to start a booking or invoice for them.",
    anyOf: [PERMISSIONS.CLIENT_VIEW],
    input: z.object({ query: z.string().trim().min(2).max(80) }),
    async run({ query }, viewer) {
      const rows = await prisma.clientProfile.findMany({
        where: {
          OR: [
            { fullName: { contains: query, mode: "insensitive" } },
            { user: { phone: { contains: query } } },
            { user: { email: { contains: query, mode: "insensitive" } } },
          ],
        },
        select: { id: true, fullName: true, user: { select: { phone: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      const links: AssistantLink[] = [];
      for (const r of rows) {
        const name = r.fullName?.trim() || "Unnamed customer";
        links.push({ label: name, href: `/admin/clients/${r.id}`, kind: "page" });
      }
      const one = rows.length === 1 ? rows[0]! : null;
      if (one && viewer.permissions.has(PERMISSIONS.BOOKING_MANAGE)) {
        const qs = new URLSearchParams({ add: "1", name: one.fullName ?? "", phone: one.user.phone ?? "" });
        links.push({ label: "Book an appointment for them", href: `/admin/calendar?${qs.toString()}`, kind: "form" });
      }
      if (one && viewer.permissions.has(PERMISSIONS.BILLING_MANAGE)) {
        links.push({ label: "New invoice for them", href: `/admin/billing/new?client=${one.id}`, kind: "form" });
      }
      return {
        title: `Customers matching “${query}”`,
        stats: rows.map((r) => ({ label: r.fullName?.trim() || "Unnamed customer", value: r.user.phone ?? "—" })),
        links,
        summary: rows.length ? `Found ${rows.length} customer${rows.length === 1 ? "" : "s"} matching “${query}”.` : `No customer matches “${query}”.`,
      };
    },
  }),
  defineTool({
    name: "needs_attention",
    description: "What is waiting on this staff member right now (their notification inbox): inquiries, unread WhatsApp, new leads, call-backs due, low stock, leave requests, unpaid invoices, edit requests.",
    anyOf: [],
    input: z.object({}),
    async run(_input, viewer) {
      const feed = await getNotificationFeed(viewer.permissions);
      const entries = (Object.entries(feed.counts) as [NotificationType, number][]).filter(([, c]) => c > 0);
      return {
        title: "Needs attention",
        stats: entries.map(([type, count]) => ({ label: NOTIFICATION_TYPE_LABELS[type], value: n(count) })),
        links: entries.slice(0, 4).map(([type]) => ({ label: NOTIFICATION_TYPE_LABELS[type], href: NOTIFICATION_TYPE_HREF[type], kind: "page" as const })),
        summary: feed.total ? `${n(feed.total)} item${feed.total === 1 ? "" : "s"} need${feed.total === 1 ? "s" : ""} attention.` : "All clear — nothing is waiting on you.",
      };
    },
  }),
  defineTool({
    name: "my_edit_requests",
    description: "The current staff member's own edit requests and their status.",
    anyOf: [],
    input: z.object({}),
    async run(_input, viewer) {
      const rows = await listMyEditRequests(viewer.id, 5);
      const pretty = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace("_", " ");
      return {
        title: "Your edit requests",
        stats: rows.map((r) => ({ label: r.title, value: r.resolutionNote ? `${pretty(r.status)} — ${r.resolutionNote}` : pretty(r.status) })),
        links: viewer.permissions.has(PERMISSIONS.SETTINGS_MANAGE) ? [{ label: "All requests", href: "/admin/requests", kind: "page" }] : [],
        summary: rows.length ? `You have ${rows.length} recent request${rows.length === 1 ? "" : "s"}.` : "You haven't filed any edit requests yet.",
      };
    },
  }),
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];

export function toolsFor(viewer: AssistantViewer): AssistantTool[] {
  return (TOOLS as readonly AssistantTool[]).filter((t) => canUseTool(t, viewer));
}

/** Run a tool by name for a viewer — re-checks permission and validates input. */
export async function runTool(name: string, rawInput: unknown, viewer: AssistantViewer, now: Date = new Date()): Promise<ToolResult> {
  const tool = (TOOLS as readonly AssistantTool[]).find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool: ${name}`);
  if (!canUseTool(tool, viewer)) {
    return { title: "Not available", stats: [], links: [], summary: "Your role doesn't include access to this information." };
  }
  const input = tool.input.parse(rawInput ?? {});
  return tool.run(input, viewer, now);
}
