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

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { utcToCenterLocal } from "@/modules/booking/availability";
import { expireStale } from "@/modules/booking/waitlist";
import { scheduleMessage } from "@/modules/booking/outbox";
import { expirePackagePurchases } from "@/modules/commerce/packages";
import { NOT_TEST_CLIENT } from "@/modules/crm/testCustomers";
import { sendAssigneeDigests } from "@/modules/notifications/digest";
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
    name: "package-reminders",
    hour: 10,
    label: "Remind customers before a package expires",
    enabled: (s) => s.packageReminderEnabled,
    run: async (ctx) => `${await schedulePackageReminders(ctx)} reminder(s) scheduled`,
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
