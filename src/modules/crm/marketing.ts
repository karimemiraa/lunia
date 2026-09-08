// Marketing math: CAC (customer acquisition cost), per-channel LTV, and
// channel-quality summaries. Built on top of campaigns.ts (CampaignSpend)
// and booking/stats.ts (bookingStats). CORRECTNESS-CRITICAL -- every metric
// below has a single, deliberately narrow definition; do not "improve" one
// without checking tests/crm/marketing.test.ts's fixtures.
//
// ---- Definitions ----
//
// "Acquisition" (for channel performance): a client is acquired via channel
// C in period [from, to) iff their FIRST booking EVER (earliest createdAt
// across their entire booking history, not just history inside the period)
// has sourceChannel = C and that first booking's createdAt falls in
// [from, to). A client can only ever be "acquired" once, on the channel of
// their very first booking -- a later booking (even one with a different
// sourceChannel, even one inside the period) never creates a second
// acquisition and never re-attributes them to a new channel. This mirrors
// booking/stats.ts's new-vs-returning classification (same "true first
// booking" lookup), just grouped by channel instead of collapsed to a
// newClients count. A null sourceChannel is grouped under the literal
// channel name "direct" (matches buildBySource in booking/stats.ts).
//
// "spendMinor": CampaignSpend.amountMinor for that channel, summed over the
// calendar months spanned by [from, to] via campaigns.ts's spendByChannel
// (periodMonth is a "YYYY-MM" string; the month containing `to` is included,
// same inclusive-of-both-endpoints behavior spendByChannel already documents).
//
// "cacMinor": spendMinor / acquisitions, ROUNDED to the nearest whole minor
// unit. Guarded: acquisitions === 0 -> null (never divide by zero; a null
// CAC is reported for a channel with spend and no acquisitions rather than
// treating it as free or fabricating a value).
//
// "revenueMinor": the LIFETIME realized revenue (sum of
// Appointment.priceMinorSnapshot across COMPLETED bookings only -- the same
// "realized revenue" definition used throughout booking/stats.ts and
// crm/ltv.ts) of the clients ACQUIRED via that channel in the period. This is
// each acquired client's full historical completed revenue, not just
// revenue booked within [from, to) -- i.e. it answers "how much have the
// clients this channel brought in this period gone on to spend, in total?"
// which is the actual CAC-vs-LTV comparison marketers want. We deliberately
// recompute this directly from Appointment/Booking (the same aggregate
// crm/ltv.ts's computeClientLtvMinor performs, batched across all of a
// channel's acquired clients in one query) rather than reading
// ClientProfile.ltvCacheMinor, so this number can never be stale regardless
// of whether refreshClientLtv has run recently for a given client.
//
// "avgLtvMinor": revenueMinor / acquisitions, ROUNDED; 0 when acquisitions
// is 0 (there is no meaningful average of zero clients, and reporting 0 -- as
// opposed to null -- keeps it safe to render/sum without a guard).
//
// channelPerformance returns the UNION of channels that have spend in the
// period and channels that have acquisitions in the period (a channel with
// spend but zero acquisitions must still surface, precisely so its CAC can
// read as null instead of silently disappearing). Sorted by acquisitions
// descending, then spendMinor descending, as the primary "which channel is
// bringing in clients" view.

import { prisma } from "@/lib/db";
import { spendByChannel } from "./campaigns";
import { bookingStats } from "../booking/stats";

export interface MarketingRangeFilter {
  from: Date;
  to: Date;
}

export interface ChannelPerformance {
  channel: string;
  acquisitions: number;
  spendMinor: number;
  cacMinor: number | null;
  revenueMinor: number;
  avgLtvMinor: number;
}

/** Per-client first-booking-ever lookup, restricted to clients who have at
 * least one booking in [from, to) (the only clients who could possibly be
 * "acquired" in this period). Returns, for each such client, the channel and
 * createdAt of their TRUE first booking (which may itself be before `from`,
 * if their qualifying candidate booking was actually a later, returning
 * visit) -- mirrors booking/stats.ts's classifyNewVsReturning. */
async function firstBookingByClient(
  from: Date,
  to: Date,
): Promise<Map<string, { createdAt: Date; sourceChannel: string | null }>> {
  const candidates = await prisma.booking.findMany({
    where: { createdAt: { gte: from, lt: to } },
    select: { clientProfileId: true },
  });
  const candidateClientIds = [...new Set(candidates.map((b) => b.clientProfileId))];
  if (candidateClientIds.length === 0) return new Map();

  const history = await prisma.booking.findMany({
    where: { clientProfileId: { in: candidateClientIds } },
    select: { clientProfileId: true, createdAt: true, sourceChannel: true },
    orderBy: { createdAt: "asc" },
  });

  const firstByClient = new Map<string, { createdAt: Date; sourceChannel: string | null }>();
  for (const row of history) {
    if (!firstByClient.has(row.clientProfileId)) {
      firstByClient.set(row.clientProfileId, { createdAt: row.createdAt, sourceChannel: row.sourceChannel });
    }
  }
  return firstByClient;
}

/** Sum of priceMinorSnapshot across COMPLETED bookings' appointments, for
 * each of the given clients -- the same definition as
 * crm/ltv.ts's computeClientLtvMinor, batched into a single query instead of
 * one aggregate per client. */
async function completedRevenueByClient(clientProfileIds: string[]): Promise<Map<string, number>> {
  if (clientProfileIds.length === 0) return new Map();
  const rows = await prisma.appointment.findMany({
    where: { booking: { clientProfileId: { in: clientProfileIds }, status: "COMPLETED" } },
    select: { priceMinorSnapshot: true, booking: { select: { clientProfileId: true } } },
  });
  const revenueByClient = new Map<string, number>();
  for (const row of rows) {
    const clientId = row.booking.clientProfileId;
    revenueByClient.set(clientId, (revenueByClient.get(clientId) ?? 0) + row.priceMinorSnapshot);
  }
  return revenueByClient;
}

/** Per-channel CAC/LTV performance for clients acquired in [from, to). See
 * the module header for exact definitions of every field. */
export async function channelPerformance({ from, to }: MarketingRangeFilter): Promise<ChannelPerformance[]> {
  const firstByClient = await firstBookingByClient(from, to);

  const acquiredClientIdsByChannel = new Map<string, string[]>();
  for (const [clientId, first] of firstByClient) {
    if (first.createdAt < from || first.createdAt >= to) continue; // their real first booking was outside the period
    const channel = first.sourceChannel ?? "direct";
    const clientIds = acquiredClientIdsByChannel.get(channel) ?? [];
    clientIds.push(clientId);
    acquiredClientIdsByChannel.set(channel, clientIds);
  }

  const spend = await spendByChannel({ from, to });
  const spendByChannelMap = new Map(spend.map((s) => [s.channel, s.amountMinor]));

  const allAcquiredClientIds = [...acquiredClientIdsByChannel.values()].flat();
  const revenueByClient = await completedRevenueByClient(allAcquiredClientIds);

  const channels = new Set<string>([...spendByChannelMap.keys(), ...acquiredClientIdsByChannel.keys()]);

  const results: ChannelPerformance[] = [];
  for (const channel of channels) {
    const clientIds = acquiredClientIdsByChannel.get(channel) ?? [];
    const acquisitions = clientIds.length;
    const spendMinor = spendByChannelMap.get(channel) ?? 0;
    const revenueMinor = clientIds.reduce((sum, id) => sum + (revenueByClient.get(id) ?? 0), 0);
    const cacMinor = acquisitions === 0 ? null : Math.round(spendMinor / acquisitions);
    const avgLtvMinor = acquisitions === 0 ? 0 : Math.round(revenueMinor / acquisitions);
    results.push({ channel, acquisitions, spendMinor, cacMinor, revenueMinor, avgLtvMinor });
  }

  return results.sort((a, b) => b.acquisitions - a.acquisitions || b.spendMinor - a.spendMinor);
}

export interface NewVsReturning {
  newClients: number;
  returningBookings: number;
}

/** New-vs-returning booking counts for [from, to) -- thin wrapper over
 * booking/stats.ts's bookingStats, which already implements this
 * (true-first-booking) classification. */
export async function newVsReturning({ from, to }: MarketingRangeFilter): Promise<NewVsReturning> {
  const stats = await bookingStats({ from, to });
  return { newClients: stats.newClients, returningBookings: stats.returningBookings };
}

export interface BestChannels {
  lowestCac: { channel: string; cacMinor: number } | null;
  highestAvgLtv: { channel: string; avgLtvMinor: number } | null;
}

/** Best-channel summary for [from, to): the lowest-CAC channel among
 * channels that actually acquired someone (a channel with 0 acquisitions has
 * cacMinor = null and is excluded -- "cheapest" must mean cheapest among
 * channels that worked, not "no data"), and the channel with the highest
 * average LTV. Both null when no channel acquired anyone in the period. */
export async function bestChannels({ from, to }: MarketingRangeFilter): Promise<BestChannels> {
  const performance = await channelPerformance({ from, to });
  const withAcquisitions = performance.filter((p) => p.acquisitions > 0);

  let lowestCac: BestChannels["lowestCac"] = null;
  let highestAvgLtv: BestChannels["highestAvgLtv"] = null;
  for (const row of withAcquisitions) {
    if (row.cacMinor !== null && (lowestCac === null || row.cacMinor < lowestCac.cacMinor)) {
      lowestCac = { channel: row.channel, cacMinor: row.cacMinor };
    }
    if (highestAvgLtv === null || row.avgLtvMinor > highestAvgLtv.avgLtvMinor) {
      highestAvgLtv = { channel: row.channel, avgLtvMinor: row.avgLtvMinor };
    }
  }

  return { lowestCac, highestAvgLtv };
}
