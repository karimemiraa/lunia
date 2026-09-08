// Monthly ad spend per channel (CampaignSpend), used alongside
// ClientProfile/Booking.sourceChannel to compute CAC. periodMonth is a
// "YYYY-MM" string (see the model comment in schema.prisma); because it's
// zero-padded, plain string comparison (`gte`/`lte`) sorts and range-filters
// it exactly like a real date would.

import { z } from "zod";
import { prisma } from "@/lib/db";
import type { CampaignSpend } from "@prisma/client";
import { utcToCenterLocal } from "../booking/availability";

const PERIOD_MONTH_PATTERN = /^\d{4}-\d{2}$/;

// Buckets a UTC instant into the CENTER-LOCAL (Asia/Riyadh) "YYYY-MM" month
// it falls in, not the UTC month. Callers build their from/to range from
// center-local month boundaries (via centerLocalToUtc), so a center-local
// month start (e.g. 2026-09-01T00:00 local) is a UTC instant still in the
// PREVIOUS UTC month (2026-08-31T21:00:00Z) -- bucketing by UTC would
// therefore pull the prior month's spend into the current month's total.
// Bucketing by center-local keeps this aligned with the period the caller
// actually means.
function toPeriodMonth(date: Date): string {
  return utcToCenterLocal(date).dateISO.slice(0, 7);
}

export interface CampaignSpendRangeFilter {
  from: Date;
  to: Date;
}

/** CampaignSpend rows whose periodMonth falls within the months spanned by [from, to] (inclusive of both endpoints' months). */
export async function listCampaignSpend({ from, to }: CampaignSpendRangeFilter): Promise<CampaignSpend[]> {
  const fromMonth = toPeriodMonth(from);
  const toMonth = toPeriodMonth(to);
  return prisma.campaignSpend.findMany({
    where: { periodMonth: { gte: fromMonth, lte: toMonth } },
    orderBy: [{ periodMonth: "asc" }, { channel: "asc" }],
  });
}

const upsertCampaignSpendSchema = z.object({
  channel: z.string().min(1),
  periodMonth: z.string().regex(PERIOD_MONTH_PATTERN, "periodMonth must be in YYYY-MM format"),
  amountMinor: z.number().int().min(0),
  note: z.string().min(1).optional(),
});
export type UpsertCampaignSpendInput = z.input<typeof upsertCampaignSpendSchema>;

/** Upserts a CampaignSpend row keyed by the unique (channel, periodMonth) pair. */
export async function upsertCampaignSpend(input: UpsertCampaignSpendInput): Promise<CampaignSpend> {
  const data = upsertCampaignSpendSchema.parse(input);
  return prisma.campaignSpend.upsert({
    where: { channel_periodMonth: { channel: data.channel, periodMonth: data.periodMonth } },
    update: { amountMinor: data.amountMinor, note: data.note ?? null },
    create: { channel: data.channel, periodMonth: data.periodMonth, amountMinor: data.amountMinor, note: data.note ?? null },
  });
}

export interface ChannelSpend {
  channel: string;
  amountMinor: number;
}

/** Total spend per channel within [from, to]'s months, highest spend first. */
export async function spendByChannel({ from, to }: CampaignSpendRangeFilter): Promise<ChannelSpend[]> {
  const rows = await listCampaignSpend({ from, to });
  const totalByChannel = new Map<string, number>();
  for (const row of rows) {
    totalByChannel.set(row.channel, (totalByChannel.get(row.channel) ?? 0) + row.amountMinor);
  }
  return [...totalByChannel.entries()]
    .map(([channel, amountMinor]) => ({ channel, amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor);
}
