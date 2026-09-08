// Read helper for the CommunicationLog table (Stage 6 admin comms view).
// Deliberately read-only: rows are written by the sending pipeline
// (outbox.ts, clientAuth.ts's OTP flow), never by the admin UI.

import { prisma } from "@/lib/db";
import type { CommunicationLog, Prisma } from "@prisma/client";

// The only two statuses ever written by the sending pipeline (see
// outbox.ts / clientAuth.ts) -- exported so the admin filter UI can build
// its <select> options from the same source of truth.
export const COMMUNICATION_LOG_STATUSES = ["SENT", "FAILED"] as const;

export interface CommunicationLogFilter {
  /** Max rows to return. Defaults to 50. */
  limit?: number;
  /** Rows to skip, for simple offset pagination. Defaults to 0. */
  offset?: number;
  kind?: string;
  status?: string;
}

export interface CommunicationLogPage {
  rows: CommunicationLog[];
  total: number;
}

const DEFAULT_LIMIT = 50;

// Lists CommunicationLog rows newest-first, optionally filtered by kind
// and/or status, with simple offset pagination. `total` reflects the
// filtered count (not the grand total), so callers can compute page count.
export async function listCommunicationLog(filter: CommunicationLogFilter = {}): Promise<CommunicationLogPage> {
  const limit = filter.limit && filter.limit > 0 ? filter.limit : DEFAULT_LIMIT;
  const offset = filter.offset && filter.offset > 0 ? filter.offset : 0;

  const where: Prisma.CommunicationLogWhereInput = {};
  if (filter.kind) where.kind = filter.kind;
  if (filter.status) where.status = filter.status;

  const [rows, total] = await Promise.all([
    prisma.communicationLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.communicationLog.count({ where }),
  ]);

  return { rows, total };
}
