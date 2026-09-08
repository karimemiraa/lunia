import { prisma } from "@/lib/db";

export interface AuditInput {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string;
  summary: string;
}

// Records one audit-trail row for a sensitive admin mutation. NEVER throws:
// auditing must not be able to break the underlying action, so a bad payload
// or a transient DB error is caught and logged, not propagated.
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    if (!input || !input.actorUserId || !input.action || !input.entityType || !input.summary) {
      console.error("[recordAudit] skipped: incomplete audit payload", { action: input?.action });
      return;
    }
    await prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary,
      },
    });
  } catch (err) {
    console.error("[recordAudit] failed to write audit row", err);
  }
}

export interface AuditLogRow {
  id: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  createdAt: Date;
}

// Most-recent-first audit rows for the admin viewer, optionally filtered by a
// case-insensitive substring across action/entityType/summary/actorUserId.
export async function listAuditLogs(options: { limit?: number; search?: string } = {}): Promise<AuditLogRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const search = options.search?.trim();
  const where = search
    ? {
        OR: [
          { action: { contains: search, mode: "insensitive" as const } },
          { entityType: { contains: search, mode: "insensitive" as const } },
          { summary: { contains: search, mode: "insensitive" as const } },
          { actorUserId: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};
  return prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit });
}
