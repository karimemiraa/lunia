// Saved client segments: a named snapshot of the roster filters (search, tier,
// status, source, tag) that staff can re-apply in one click for targeted
// re-engagement / marketing. The filter is stored as the same shape the roster
// reads from its query string.

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export interface SegmentFilter {
  search?: string;
  tierKey?: string;
  source?: string;
  status?: string;
  tag?: string;
}

export interface SegmentRow {
  id: string;
  name: string;
  filter: SegmentFilter;
  createdAt: Date;
}

const FILTER_KEYS: (keyof SegmentFilter)[] = ["search", "tierKey", "source", "status", "tag"];

function coerceFilter(raw: unknown): SegmentFilter {
  const out: SegmentFilter = {};
  if (raw && typeof raw === "object") {
    for (const key of FILTER_KEYS) {
      const value = (raw as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) out[key] = value.trim();
    }
  }
  return out;
}

export async function listSegments(): Promise<SegmentRow[]> {
  const rows = await prisma.segment.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((row) => ({ id: row.id, name: row.name, filter: coerceFilter(row.filter), createdAt: row.createdAt }));
}

export async function createSegment(name: string, filter: SegmentFilter, createdById?: string): Promise<SegmentRow> {
  const clean = coerceFilter(filter);
  const row = await prisma.segment.create({
    data: { name: name.trim().slice(0, 80), filter: clean as unknown as Prisma.InputJsonValue, createdById: createdById ?? null },
  });
  return { id: row.id, name: row.name, filter: clean, createdAt: row.createdAt };
}

export async function deleteSegment(id: string): Promise<void> {
  await prisma.segment.delete({ where: { id } });
}

/** Serializes a segment filter into a roster query string (e.g. "?tag=VIP&status=active"). */
export function segmentToQuery(filter: SegmentFilter): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = filter[key];
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}
