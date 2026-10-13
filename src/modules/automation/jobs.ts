// Scheduled automations, run by the worker (worker/index.ts) on every tick.
// Each job runs at most once per Riyadh day, after its hour: the worker first
// claims a unique JobRun(job, day) row, so several replicas or a restart can
// never run a job twice. Jobs only ever SCHEDULE customer messages through
// the normal outbox (which re-checks opt-outs at send time); they never send
// directly.
//
// Jobs
// - waitlist-expiry   01:00  Waitlist entries for past dates → EXPIRED
// - package-expiry    01:00  Package purchases past expiry → EXPIRED
// - package-reminders 10:00  "Your package expires soon" (once per purchase)
// - win-back          11:00  "We miss you" to lapsed customers (owner opt-in)
// - staff-digest      08:00  Per-assignee email digest (owner opt-in)
// - membership-billing 09:00 Invoice the next membership month; flag unpaid

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { utcToCenterLocal } from "@/modules/booking/availability";
import { expireStale } from "@/modules/booking/waitlist";
import { scheduleMessage } from "@/modules/booking/outbox";
import { expirePackagePurchases } from "@/modules/commerce/packages";
import { NOT_TEST_CLIENT } from "@/modules/crm/testCustomers";
import { sendAssigneeDigests } from "@/modules/notifications/digest";
import { runMembershipBilling } from "@/modules/memberships/memberships";
import { markNoShow } from "@/modules/booking/bookings";
import { sendInvoice } from "@/modules/billing/delivery";
import { onlinePaymentsConfigured } from "@/modules/billing/payments/links";
import { getSetting, DEFAULT_AUTOMATION_SETTINGS, type AutomationSettings } from "@/modules/cms/settings";

const DAY_MS = 86_400_000;
/** A customer gets at most one win-back message in this many days. */
export const WIN_BACK_COOLDOWN_DAYS = 180;
/** Lapsed customers are picked up during this many days after crossing the threshold. */
const WIN_BACK_WINDOW_DAYS = 14;

export interface JobContext {
  now: Date;
  settings: AutomationSettings;
}

export interface JobDef {
  name: string;
  /** Riyadh hour (0–23) from which the day's run may start. */
  hour: number;
  label: string;
  enabled: (s: AutomationSettings) => boolean;
  run: (ctx: JobContext) => Promise<string>;
}

function appUrl(): string {
  try {
    return getEnv().APP_URL;
  } catch {
    return "http://localhost:3000";
  }
}

const toLocale = (l: string | null | undefined): "ar" | "en" => (l?.toLowerCase().startsWith("en") ? "en" : "ar");

function formatDay(d: Date, locale: "ar" | "en"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA-u-ca-gregory-nu-arab" : "en-GB", { timeZone: "Asia/Riyadh", day: "numeric", month: "long", year: "numeric" }).format(d);
}

// ---- jobs ----------------------------------------------------------------------

export async function schedulePackageReminders({ now, settings }: JobContext): Promise<number> {
  const until = new Date(now.getTime() + settings.packageReminderDays * DAY_MS);
  const due = await prisma.packagePurchase.findMany({
    where: {
      status: "ACTIVE",
      sessionsRemaining: { gt: 0 },
      expiryReminderAt: null,
      expiresAt: { gt: now, lte: until },
      clientProfile: NOT_TEST_CLIENT,
    },
    include: { package: true, clientProfile: { include: { user: true } } },
    take: 200,
  });
  let scheduled = 0;
  for (const p of due) {
    // Claim first (only one run/replica schedules a given purchase's reminder).
    const claimed = await prisma.packagePurchase.updateMany({ where: { id: p.id, expiryReminderAt: null }, data: { expiryReminderAt: now } });
    if (claimed.count !== 1) continue;
    const user = p.clientProfile.user;
    if (!user.phone && !user.email) continue;
    const locale = toLocale(user.locale);
    await scheduleMessage({
      kind: "PACKAGE_EXPIRING",
      clientProfileId: p.clientProfileId,
      toPhone: user.phone ?? undefined,
      toEmail: user.email ?? undefined,
      locale,
      sendAt: now,
      payload: {
        name: p.clientProfile.fullName.trim().split(/\s+/)[0] ?? "",
        packageName: locale === "ar" ? p.package.nameAr : p.package.nameEn,
        sessionsLeft: p.sessionsRemaining,
        expiresOn: formatDay(p.expiresAt!, locale),
        link: `${appUrl()}/${locale}/book`,
      },
    });
    scheduled += 1;
  }
  return scheduled;
}

/** Customers whose last completed visit crossed the win-back threshold recently, with nothing booked. */
export async function findLapsedCustomers(now: Date, settings: AutomationSettings) {
  const lapsedBefore = new Date(now.getTime() - settings.winBackDays * DAY_MS);
  const windowStart = new Date(lapsedBefore.getTime() - WIN_BACK_WINDOW_DAYS * DAY_MS);
  const cooldownStart = new Date(now.getTime() - WIN_BACK_COOLDOWN_DAYS * DAY_MS);

  // Last completed visit per customer, in SQL (one row per customer).
  const rows = await prisma.$queryRaw<{ clientProfileId: string; lastVisit: Date; serviceId: string }[]>(Prisma.sql`
    SELECT DISTINCT ON (b."clientProfileId") b."clientProfileId", a."startAt" AS "lastVisit", a."serviceId"
    FROM "Booking" b
    JOIN "Appointment" a ON a."bookingId" = b.id
    WHERE b.status = 'COMPLETED'
    ORDER BY b."clientProfileId", a."startAt" DESC
  `);
  const candidates = rows.filter((r) => r.lastVisit < lapsedBefore && r.lastVisit >= windowStart);
  if (candidates.length === 0) return [];
  const ids = candidates.map((r) => r.clientProfileId);

  const [upcoming, recentlyMessaged, profiles] = await Promise.all([
    prisma.booking.findMany({
      where: { clientProfileId: { in: ids }, status: { in: ["REQUESTED", "CONFIRMED", "CHECKED_IN"] }, appointments: { some: { startAt: { gte: now } } } },
      select: { clientProfileId: true },
    }),
    prisma.scheduledMessage.findMany({ where: { kind: "WIN_BACK", clientProfileId: { in: ids }, sendAt: { gte: cooldownStart } }, select: { clientProfileId: true } }),
    prisma.clientProfile.findMany({
      where: { id: { in: ids }, ...NOT_TEST_CLIENT, NOT: { notificationPreference: { is: { marketingOptIn: false } } } },
      include: { user: true },
    }),
  ]);
  const skip = new Set([...upcoming.map((b) => b.clientProfileId), ...recentlyMessaged.map((m) => m.clientProfileId!)]);
  const byId = new Map(candidates.map((c) => [c.clientProfileId, c]));
  return profiles
    .filter((p) => !skip.has(p.id) && (p.user.phone || p.user.email))
    .map((p) => ({ profile: p, lastVisit: byId.get(p.id)!.lastVisit, serviceId: byId.get(p.id)!.serviceId }))
    .sort((a, b) => a.lastVisit.getTime() - b.lastVisit.getTime());
}

export async function scheduleWinBacks({ now, settings }: JobContext): Promise<number> {
  const lapsed = (await findLapsedCustomers(now, settings)).slice(0, settings.winBackDailyCap);
  if (lapsed.length === 0) return 0;
  const services = await prisma.service.findMany({ where: { id: { in: [...new Set(lapsed.map((l) => l.serviceId))] } }, select: { id: true, nameEn: true, nameAr: true } });
  const serviceById = new Map(services.map((s) => [s.id, s]));
  for (const l of lapsed) {
    const locale = toLocale(l.profile.user.locale);
    const service = serviceById.get(l.serviceId);
    await scheduleMessage({
      kind: "WIN_BACK",
      clientProfileId: l.profile.id,
      toPhone: l.profile.user.phone ?? undefined,
      toEmail: l.profile.user.email ?? undefined,
      locale,
      sendAt: now,
      payload: {
        name: l.profile.fullName.trim().split(/\s+/)[0] ?? "",
        lastService: service ? (locale === "ar" ? service.nameAr : service.nameEn) : "",
        link: `${appUrl()}/${locale}/book`,
      },
    });
  }
  return lapsed.length;
}

/** Gift cards past their expiry date → EXPIRED (redemption already refuses them). */
export async function expireGiftCards(now: Date): Promise<number> {
  const { count } = await prisma.giftCard.updateMany({ where: { status: "ACTIVE", expiresAt: { lte: now } }, data: { status: "EXPIRED" } });
  return count;
}

const MAX_INVOICE_REMINDERS = 2;

/**
 * Re-sends unpaid invoices to the customer (with a pay link when online
 * payments are configured): first after N days, again after 2N. At most two
 * reminders per invoice; test customers and walk-ins without contact skipped.
 */
export async function sendInvoiceReminders({ now, settings }: JobContext): Promise<number> {
  const days = settings.invoiceReminderDays;
  const candidates = await prisma.invoice.findMany({
    where: {
      kind: "INVOICE",
      status: { in: ["ISSUED", "PARTIALLY_PAID"] },
      remindersSent: { lt: MAX_INVOICE_REMINDERS },
      issuedAt: { lte: new Date(now.getTime() - days * DAY_MS) },
      clientProfileId: { not: null },
      client: NOT_TEST_CLIENT,
    },
    include: { client: { include: { user: true } } },
    take: 100,
  });
  let sent = 0;
  for (const inv of candidates) {
    const dueAt = inv.issuedAt!.getTime() + days * (inv.remindersSent + 1) * DAY_MS;
    if (dueAt > now.getTime()) continue;
    // Claim first so replicas/re-runs never double-send.
    const claimed = await prisma.invoice.updateMany({ where: { id: inv.id, remindersSent: inv.remindersSent }, data: { remindersSent: { increment: 1 }, lastReminderAt: now } });
    if (claimed.count !== 1) continue;
    const phone = inv.customerPhone || inv.client?.user.phone;
    const channel = phone ? "whatsapp" : inv.client?.user.email ? "email" : null;
    if (!channel) continue;
    const r = await sendInvoice(inv.id, { channel, includePayLink: await onlinePaymentsConfigured() });
    if (r.ok) sent += 1;
  }
  return sent;
}

/**
 * Appointments that ended more than N hours ago and were never checked in →
 * NO_SHOW (keeps reports and no-show rates honest). Only looks back 14 days so
 * switching it on doesn't rewrite old history.
 */
export async function markStaleNoShows({ now, settings }: JobContext): Promise<number> {
  const cutoff = new Date(now.getTime() - settings.autoNoShowHours * 3_600_000);
  const stale = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      checkIn: null,
      appointments: { some: {}, every: { endAt: { lte: cutoff, gte: new Date(now.getTime() - 14 * DAY_MS) } } },
    },
    select: { id: true },
    take: 200,
  });
  let marked = 0;
  for (const b of stale) {
    try {
      await markNoShow(b.id);
      marked += 1;
    } catch {
      /* status changed meanwhile */
    }
  }
  return marked;
}

export const JOBS: JobDef[] = [
  {
    name: "waitlist-expiry",
    hour: 1,
    label: "Expire past waitlist entries",
    enabled: () => true,
    run: async ({ now }) => `${await expireStale(utcToCenterLocal(now).dateISO)} expired`,
  },
  {
    name: "package-expiry",
    hour: 1,
    label: "Expire packages past their validity",
    enabled: () => true,
    run: async ({ now }) => `${await expirePackagePurchases(now)} expired`,
  },
  {
    name: "gift-card-expiry",
    hour: 1,
    label: "Expire gift cards past their expiry date",
    enabled: () => true,
    run: async ({ now }) => `${await expireGiftCards(now)} expired`,
  },
  {
    name: "auto-no-show",
    hour: 2,
    label: "Mark never-checked-in appointments as no-shows",
    enabled: (s) => s.autoNoShowEnabled,
    run: async (ctx) => `${await markStaleNoShows(ctx)} marked`,
  },
  {
    name: "staff-digest",
    hour: 8,
    label: "Email each assignee their open items",
    enabled: (s) => s.staffDigestEnabled,
    run: async () => {
      const r = await sendAssigneeDigests();
      return `${r.emailsSent} email(s) to ${r.assigneesNotified} assignee(s)`;
    },
  },
  {
    name: "membership-billing",
    hour: 9,
    label: "Invoice membership months and flag unpaid ones",
    enabled: () => true,
    run: async ({ now }) => {
      const r = await runMembershipBilling(now);
      return `${r.invoiced} invoiced, ${r.pastDue} past due, ${r.ended} ended`;
    },
  },
  {
    name: "package-reminders",
    hour: 10,
    label: "Remind customers before a package expires",
    enabled: (s) => s.packageReminderEnabled,
    run: async (ctx) => `${await schedulePackageReminders(ctx)} reminder(s) scheduled`,
  },
  {
    name: "invoice-reminders",
    hour: 10,
    label: "Remind customers about unpaid invoices",
    enabled: (s) => s.invoiceReminderEnabled,
    run: async (ctx) => `${await sendInvoiceReminders(ctx)} reminder(s) sent`,
  },
  {
    name: "win-back",
    hour: 11,
    label: "Invite lapsed customers back",
    enabled: (s) => s.winBackEnabled,
    run: async (ctx) => `${await scheduleWinBacks(ctx)} message(s) scheduled`,
  },
];

export async function getAutomationSettings(): Promise<AutomationSettings> {
  return (await getSetting("automations").catch(() => null)) ?? DEFAULT_AUTOMATION_SETTINGS;
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export interface JobOutcome {
  job: string;
  status: "ran" | "failed" | "skipped";
  summary?: string;
}

/**
 * Runs every job that is enabled, past its hour today (Riyadh) and not yet
 * run today. Safe to call on every worker tick and from several replicas.
 */
export async function runDueJobs(now: Date = new Date(), jobs: JobDef[] = JOBS): Promise<JobOutcome[]> {
  const { dateISO, minutes } = utcToCenterLocal(now);
  const hour = Math.floor(minutes / 60);
  const settings = await getAutomationSettings();
  const out: JobOutcome[] = [];
  for (const job of jobs) {
    if (hour < job.hour || !job.enabled(settings)) continue;
    let runId: string;
    try {
      runId = (await prisma.jobRun.create({ data: { job: job.name, runKey: dateISO } })).id;
    } catch (err) {
      if (isUniqueViolation(err)) continue; // already ran (or running) today
      throw err;
    }
    try {
      const summary = await job.run({ now, settings });
      await prisma.jobRun.update({ where: { id: runId }, data: { finishedAt: new Date(), ok: true, summary } });
      out.push({ job: job.name, status: "ran", summary });
    } catch (err) {
      const summary = err instanceof Error ? err.message.slice(0, 500) : "failed";
      await prisma.jobRun.update({ where: { id: runId }, data: { finishedAt: new Date(), ok: false, summary } });
      out.push({ job: job.name, status: "failed", summary });
    }
  }
  return out;
}

/** Latest run per job, for the admin Automations card. */
export async function latestJobRuns(): Promise<Record<string, { startedAt: Date; ok: boolean | null; summary: string | null }>> {
  const rows = await prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 60 });
  const out: Record<string, { startedAt: Date; ok: boolean | null; summary: string | null }> = {};
  for (const r of rows) if (!out[r.job]) out[r.job] = { startedAt: r.startedAt, ok: r.ok, summary: r.summary };
  return out;
}
