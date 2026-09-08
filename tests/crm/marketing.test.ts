import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import type { Room, Service, User } from "@prisma/client";
import { upsertCampaignSpend } from "@/modules/crm/campaigns";
import { channelPerformance, newVsReturning, bestChannels } from "@/modules/crm/marketing";
import { centerLocalToUtc } from "@/modules/booking/availability";

// All rows in this suite are created with booking createdAt inside a single
// narrow, far-future window that nothing else in the codebase writes to, so
// channelPerformance's table-wide range scan only ever sees rows this suite
// created. See tests/analytics/queries.test.ts for the same pattern.
//
// RANGE_FROM/RANGE_TO are built the way real call sites build them (e.g.
// admin/marketing/page.tsx): centerLocalToUtc(monthStartISO, 0) for a
// center-local (Asia/Riyadh, UTC+3) calendar-month boundary. This means the
// underlying UTC instants sit a few hours BEFORE their nominal center-local
// midnight (e.g. "2032-08-01" center-local midnight is
// 2032-07-31T21:00:00.000Z in UTC) -- exactly the shape that exposed the
// center-local/UTC month-bucketing bug in toPeriodMonth.
const PERIOD_MONTH = "2032-08";
const PERIOD_MONTH_BEFORE = "2032-07"; // the calendar month immediately before PERIOD_MONTH
const RANGE_FROM = centerLocalToUtc("2032-08-01", 0);
const RANGE_TO = centerLocalToUtc("2032-09-01", 0); // exclusive upper bound
const BEFORE_RANGE = new Date("2032-07-15T00:00:00.000Z"); // strictly before RANGE_FROM

const RUN_ID = Date.now();
const CHANNEL_CAC = `crm-mkt-test-cac-${RUN_ID}`; // 5 acquisitions, 100_000 spend -> CAC 20_000
const CHANNEL_ZERO = `crm-mkt-test-zero-${RUN_ID}`; // 0 acquisitions, some spend -> CAC null
const CHANNEL_REVENUE = `crm-mkt-test-revenue-${RUN_ID}`; // known completed revenue
const CHANNEL_STALE = `crm-mkt-test-stale-${RUN_ID}`; // client's real first booking predates the range
const CHANNEL_CHEAP = `crm-mkt-test-cheap-${RUN_ID}`; // lower CAC than CHANNEL_CAC, for bestChannels
const CHANNEL_HIGH_LTV = `crm-mkt-test-highltv-${RUN_ID}`; // highest avg LTV, for bestChannels

const EMAIL_PREFIX = `crm-mkt-test-${RUN_ID}-`;
let emailCounter = 0;
function freshEmail(): string {
  emailCounter += 1;
  return `${EMAIL_PREFIX}${emailCounter}@example.com`;
}

let service: Service;
let owner: User;
let testRoom: Room;

async function sweepTestData() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: EMAIL_PREFIX } },
    include: { clientProfile: true },
  });
  const clientProfileIds = users.map((u) => u.clientProfile?.id).filter((id): id is string => !!id);
  if (clientProfileIds.length > 0) {
    const bookings = await prisma.booking.findMany({ where: { clientProfileId: { in: clientProfileIds } } });
    const bookingIds = bookings.map((b) => b.id);
    if (bookingIds.length > 0) {
      await prisma.appointment.deleteMany({ where: { bookingId: { in: bookingIds } } });
    }
    await prisma.booking.deleteMany({ where: { clientProfileId: { in: clientProfileIds } } });
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
  await prisma.room.deleteMany({ where: { name: "Marketing Test Room" } });
  await prisma.campaignSpend.deleteMany({ where: { channel: { startsWith: `crm-mkt-test-` } } });
}

beforeAll(async () => {
  await sweepTestData();
  service = await prisma.service.findUniqueOrThrow({ where: { slug: "diagnostic-skin-analysis" } });
  owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@lunia.local" } });
  testRoom = await prisma.room.create({ data: { name: "Marketing Test Room", capacity: 1, order: 999 } });
});

afterAll(async () => {
  await sweepTestData();
});

/** Creates a fresh client whose FIRST (and possibly only) booking has the
 * given sourceChannel/createdAt/status/price -- i.e. this booking IS the
 * event that "acquires" the client. */
async function createAcquiredClient(params: {
  name: string;
  sourceChannel: string | null;
  firstBookingAt: Date;
  status: "CONFIRMED" | "COMPLETED";
  priceMinor: number;
}) {
  const user = await prisma.user.create({
    data: {
      type: "CLIENT",
      email: freshEmail(),
      phone: `+9665MKT${RUN_ID}${Math.floor(Math.random() * 1_000_000)}`,
      clientProfile: { create: { fullName: params.name, sourceChannel: params.sourceChannel } },
    },
    include: { clientProfile: true },
  });
  const clientProfileId = user.clientProfile!.id;
  const booking = await prisma.booking.create({
    data: {
      clientProfileId,
      status: params.status,
      sourceChannel: params.sourceChannel,
      createdAt: params.firstBookingAt,
      appointments: {
        create: {
          serviceId: service.id,
          staffUserId: owner.id,
          roomId: testRoom.id,
          startAt: params.firstBookingAt,
          endAt: new Date(params.firstBookingAt.getTime() + service.durationMin * 60_000),
          priceMinorSnapshot: params.priceMinor,
        },
      },
    },
  });
  return { clientProfileId, booking };
}

/** Adds a second (non-first) booking for an existing client. */
async function addFollowUpBooking(params: {
  clientProfileId: string;
  sourceChannel: string | null;
  createdAt: Date;
  status: "CONFIRMED" | "COMPLETED";
  priceMinor: number;
}) {
  return prisma.booking.create({
    data: {
      clientProfileId: params.clientProfileId,
      status: params.status,
      sourceChannel: params.sourceChannel,
      createdAt: params.createdAt,
      appointments: {
        create: {
          serviceId: service.id,
          staffUserId: owner.id,
          roomId: testRoom.id,
          startAt: params.createdAt,
          endAt: new Date(params.createdAt.getTime() + service.durationMin * 60_000),
          priceMinorSnapshot: params.priceMinor,
        },
      },
    },
  });
}

describe("channelPerformance", () => {
  it("computes CAC = spend / acquisitions, rounded, for a channel with known numbers", async () => {
    await upsertCampaignSpend({ channel: CHANNEL_CAC, periodMonth: PERIOD_MONTH, amountMinor: 100_000 });
    for (let i = 0; i < 5; i += 1) {
      await createAcquiredClient({
        name: `CAC Client ${i}`,
        sourceChannel: CHANNEL_CAC,
        firstBookingAt: new Date(RANGE_FROM.getTime() + i * 60_000),
        status: "CONFIRMED",
        priceMinor: 0,
      });
    }

    const perf = await channelPerformance({ from: RANGE_FROM, to: RANGE_TO });
    const row = perf.find((p) => p.channel === CHANNEL_CAC);
    expect(row).toBeDefined();
    expect(row!.acquisitions).toBe(5);
    expect(row!.spendMinor).toBe(100_000);
    expect(row!.cacMinor).toBe(20_000);
  });

  it("returns cacMinor = null (never divides by zero) for a channel with spend but 0 acquisitions", async () => {
    await upsertCampaignSpend({ channel: CHANNEL_ZERO, periodMonth: PERIOD_MONTH, amountMinor: 50_000 });

    const perf = await channelPerformance({ from: RANGE_FROM, to: RANGE_TO });
    const row = perf.find((p) => p.channel === CHANNEL_ZERO);
    expect(row).toBeDefined();
    expect(row!.acquisitions).toBe(0);
    expect(row!.spendMinor).toBe(50_000);
    expect(row!.cacMinor).toBeNull();
    expect(row!.avgLtvMinor).toBe(0);
  });

  it("revenueMinor sums acquired clients' COMPLETED appointment prices; avgLtvMinor = revenue / acquisitions", async () => {
    // Two acquired clients: one COMPLETED (counts), one CONFIRMED (never happened, $0 revenue).
    await createAcquiredClient({
      name: "Revenue Client Completed",
      sourceChannel: CHANNEL_REVENUE,
      firstBookingAt: new Date(RANGE_FROM.getTime() + 10 * 60_000),
      status: "COMPLETED",
      priceMinor: 30_000,
    });
    await createAcquiredClient({
      name: "Revenue Client Confirmed",
      sourceChannel: CHANNEL_REVENUE,
      firstBookingAt: new Date(RANGE_FROM.getTime() + 11 * 60_000),
      status: "CONFIRMED",
      priceMinor: 99_999, // must NOT count -- booking never completed
    });

    const perf = await channelPerformance({ from: RANGE_FROM, to: RANGE_TO });
    const row = perf.find((p) => p.channel === CHANNEL_REVENUE);
    expect(row).toBeDefined();
    expect(row!.acquisitions).toBe(2);
    expect(row!.revenueMinor).toBe(30_000);
    expect(row!.avgLtvMinor).toBe(15_000); // 30_000 / 2
  });

  it("attributes a client to the channel of their TRUE first booking ever, not a later in-range booking", async () => {
    const { clientProfileId } = await createAcquiredClient({
      name: "Stale Attribution Client",
      sourceChannel: "old-channel-before-range",
      firstBookingAt: BEFORE_RANGE, // real first booking, before the range
      status: "CONFIRMED",
      priceMinor: 0,
    });
    // A second, in-range booking with a DIFFERENT channel -- this must not
    // count as an "acquisition" for CHANNEL_STALE, because the client's
    // first booking ever was before the range.
    await addFollowUpBooking({
      clientProfileId,
      sourceChannel: CHANNEL_STALE,
      createdAt: new Date(RANGE_FROM.getTime() + 20 * 60_000),
      status: "CONFIRMED",
      priceMinor: 0,
    });

    const perf = await channelPerformance({ from: RANGE_FROM, to: RANGE_TO });
    const staleRow = perf.find((p) => p.channel === CHANNEL_STALE);
    expect(staleRow?.acquisitions ?? 0).toBe(0);
  });

  it("excludes CampaignSpend from the month AFTER `to` when `to` sits exactly on a month boundary", async () => {
    // [RANGE_FROM, RANGE_TO) = [2032-08-01T00:00Z, 2032-09-01T00:00Z) -- `to`
    // sits exactly on the boundary between August and September. Spend is
    // seeded for BOTH the in-range month (August, PERIOD_MONTH) and the
    // following month (September) for the same channel. Only August's spend
    // must be reflected in spendMinor/cacMinor -- September's must NOT be
    // pulled in just because `to` (exclusive) falls on its first instant.
    const CHANNEL_BOUNDARY = `crm-mkt-test-boundary-${RUN_ID}`;
    await upsertCampaignSpend({ channel: CHANNEL_BOUNDARY, periodMonth: PERIOD_MONTH, amountMinor: 40_000 });
    await upsertCampaignSpend({ channel: CHANNEL_BOUNDARY, periodMonth: "2032-09", amountMinor: 999_000 });
    for (let i = 0; i < 4; i += 1) {
      await createAcquiredClient({
        name: `Boundary Client ${i}`,
        sourceChannel: CHANNEL_BOUNDARY,
        firstBookingAt: new Date(RANGE_FROM.getTime() + (40 + i) * 60_000),
        status: "CONFIRMED",
        priceMinor: 0,
      });
    }

    const perf = await channelPerformance({ from: RANGE_FROM, to: RANGE_TO });
    const row = perf.find((p) => p.channel === CHANNEL_BOUNDARY);
    expect(row).toBeDefined();
    expect(row!.acquisitions).toBe(4);
    expect(row!.spendMinor).toBe(40_000); // must NOT include September's 999_000
    expect(row!.cacMinor).toBe(10_000); // 40_000 / 4, not (40_000 + 999_000) / 4
  });

  it("excludes CampaignSpend from the month BEFORE `from` (center-local month bucketing, not UTC)", async () => {
    // RANGE_FROM = centerLocalToUtc("2032-08-01", 0) = 2032-07-31T21:00:00Z --
    // a UTC instant that falls in *July* by naive UTC-month extraction, even
    // though it represents center-local August 1st midnight. A toPeriodMonth
    // that buckets by UTC (the bug) would derive fromMonth = "2032-07" here,
    // pulling July's spend into what should be an August-only window. Spend
    // is seeded for BOTH the in-range month (August, PERIOD_MONTH) and the
    // month before it (July, PERIOD_MONTH_BEFORE) for the same channel; only
    // August's spend must be reflected in spendMinor/cacMinor.
    const CHANNEL_LOWER_BOUNDARY = `crm-mkt-test-lowerboundary-${RUN_ID}`;
    await upsertCampaignSpend({ channel: CHANNEL_LOWER_BOUNDARY, periodMonth: PERIOD_MONTH, amountMinor: 60_000 });
    await upsertCampaignSpend({
      channel: CHANNEL_LOWER_BOUNDARY,
      periodMonth: PERIOD_MONTH_BEFORE,
      amountMinor: 999_000,
    });
    for (let i = 0; i < 3; i += 1) {
      await createAcquiredClient({
        name: `Lower Boundary Client ${i}`,
        sourceChannel: CHANNEL_LOWER_BOUNDARY,
        firstBookingAt: new Date(RANGE_FROM.getTime() + (60 + i) * 60_000),
        status: "CONFIRMED",
        priceMinor: 0,
      });
    }

    const perf = await channelPerformance({ from: RANGE_FROM, to: RANGE_TO });
    const row = perf.find((p) => p.channel === CHANNEL_LOWER_BOUNDARY);
    expect(row).toBeDefined();
    expect(row!.acquisitions).toBe(3);
    expect(row!.spendMinor).toBe(60_000); // must NOT include July's 999_000
    expect(row!.cacMinor).toBe(20_000); // 60_000 / 3, not (60_000 + 999_000) / 3
  });

  it("null sourceChannel is grouped under \"direct\"", async () => {
    await createAcquiredClient({
      name: "Direct Client",
      sourceChannel: null,
      firstBookingAt: new Date(RANGE_FROM.getTime() + 30 * 60_000),
      status: "CONFIRMED",
      priceMinor: 0,
    });

    const perf = await channelPerformance({ from: RANGE_FROM, to: RANGE_TO });
    const direct = perf.find((p) => p.channel === "direct");
    expect(direct).toBeDefined();
    expect(direct!.acquisitions).toBeGreaterThanOrEqual(1);
  });
});

describe("bestChannels", () => {
  // Its own day-level sub-window (still inside PERIOD_MONTH, so CampaignSpend
  // resolves the same as the rest of the suite) so this test's acquisition
  // counts aren't polluted by the other describe blocks' fixtures, which all
  // live on RANGE_FROM's day (2032-08-01) rather than this day (2032-08-15).
  const BEST_FROM = new Date("2032-08-15T00:00:00.000Z");
  const BEST_TO = new Date("2032-08-16T00:00:00.000Z");

  it("picks the lowest-CAC channel among channels with acquisitions, and the highest avg-LTV channel", async () => {
    await upsertCampaignSpend({ channel: CHANNEL_CAC, periodMonth: PERIOD_MONTH, amountMinor: 100_000 });
    for (let i = 0; i < 5; i += 1) {
      await createAcquiredClient({
        name: `Best CAC Baseline ${i}`,
        sourceChannel: CHANNEL_CAC,
        firstBookingAt: new Date(BEST_FROM.getTime() + i * 60_000),
        status: "CONFIRMED",
        priceMinor: 0,
      });
    }
    // CHANNEL_CHEAP: same acquisitions (5), lower spend -> lower CAC than CHANNEL_CAC.
    await upsertCampaignSpend({ channel: CHANNEL_CHEAP, periodMonth: PERIOD_MONTH, amountMinor: 25_000 });
    for (let i = 0; i < 5; i += 1) {
      await createAcquiredClient({
        name: `Cheap Client ${i}`,
        sourceChannel: CHANNEL_CHEAP,
        firstBookingAt: new Date(BEST_FROM.getTime() + (10 + i) * 60_000),
        status: "CONFIRMED",
        priceMinor: 0,
      });
    }
    // CHANNEL_HIGH_LTV: 1 acquisition with very high completed revenue -> highest avg LTV,
    // but also given enough spend that its own CAC is well above CHANNEL_CHEAP's, so the
    // two "best" picks are meaningfully different channels.
    await upsertCampaignSpend({ channel: CHANNEL_HIGH_LTV, periodMonth: PERIOD_MONTH, amountMinor: 500_000 });
    await createAcquiredClient({
      name: "High LTV Client",
      sourceChannel: CHANNEL_HIGH_LTV,
      firstBookingAt: new Date(BEST_FROM.getTime() + 20 * 60_000),
      status: "COMPLETED",
      priceMinor: 1_000_000,
    });

    const best = await bestChannels({ from: BEST_FROM, to: BEST_TO });
    expect(best.lowestCac).not.toBeNull();
    expect(best.lowestCac!.channel).toBe(CHANNEL_CHEAP);
    expect(best.lowestCac!.cacMinor).toBe(5_000); // 25_000 / 5

    expect(best.highestAvgLtv).not.toBeNull();
    expect(best.highestAvgLtv!.channel).toBe(CHANNEL_HIGH_LTV);
    expect(best.highestAvgLtv!.avgLtvMinor).toBe(1_000_000);
  });

  it("returns nulls when no channel has any acquisitions", async () => {
    const farFuture = { from: new Date("2033-01-01T00:00:00.000Z"), to: new Date("2033-02-01T00:00:00.000Z") };
    const best = await bestChannels(farFuture);
    expect(best.lowestCac).toBeNull();
    expect(best.highestAvgLtv).toBeNull();
  });
});

describe("newVsReturning", () => {
  it("reuses bookingStats' new-vs-returning classification", async () => {
    const { clientProfileId } = await createAcquiredClient({
      name: "New Vs Returning Client",
      sourceChannel: CHANNEL_CAC,
      firstBookingAt: new Date(RANGE_FROM.getTime() + 5 * 60 * 60_000),
      status: "CONFIRMED",
      priceMinor: 0,
    });
    await addFollowUpBooking({
      clientProfileId,
      sourceChannel: CHANNEL_CAC,
      createdAt: new Date(RANGE_FROM.getTime() + 6 * 60 * 60_000),
      status: "CONFIRMED",
      priceMinor: 0,
    });

    const result = await newVsReturning({ from: RANGE_FROM, to: RANGE_TO });
    expect(result.newClients).toBeGreaterThanOrEqual(1);
    expect(result.returningBookings).toBeGreaterThanOrEqual(1);
  });
});
