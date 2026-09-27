// "View as customer": lets the owner/admins open the public site signed in as
// a specific customer, to see exactly what that customer sees.
//
// Mechanics: a normal client session (same cookie the OTP login sets) is
// created with a 1-hour server-side TTL, plus a separate short-lived marker
// (random id -> Redis record) held in its own httpOnly cookie. The public
// layout shows a banner whenever the marker is valid; Exit destroys both.
//
// Who may use it: platform:manage (the owner) or settings:manage (the admin
// role). staff:manage is deliberately NOT enough: managers hold it, and being
// able to act inside a customer's account (book, cancel, message) is a
// higher-trust power than editing staff users. Every start/end is audited.
//
// Never allowed on staff accounts: only CLIENT users with no staff roles or
// staff profile can be targeted, so this can't be used to borrow a colleague's
// identity.

import { randomBytes } from "crypto";
import { getRedis } from "@/lib/redis";
import { prisma } from "@/lib/db";
import { createSession, destroySession } from "./session";
import { recordAudit } from "./audit";
import { PERMISSIONS, type PermissionKey } from "./permissions";

export const IMPERSONATION_COOKIE = "lunia_impersonation";
export const IMPERSONATION_TTL_SECONDS = 60 * 60;

const markerKey = (id: string) => `impersonation:${id}`;

export interface ImpersonationRecord {
  actorUserId: string;
  clientUserId: string;
  clientProfileId: string;
  clientName: string;
  sessionToken: string;
  startedAt: string;
}

export function canImpersonate(permissions: Set<PermissionKey>): boolean {
  return permissions.has(PERMISSIONS.PLATFORM_MANAGE) || permissions.has(PERMISSIONS.SETTINGS_MANAGE);
}

export class ImpersonationError extends Error {}

export interface StartImpersonationResult {
  sessionToken: string;
  markerId: string;
  clientName: string;
  locale: string;
}

export async function startImpersonation(input: {
  actorUserId: string;
  actorPermissions: Set<PermissionKey>;
  clientProfileId: string;
}): Promise<StartImpersonationResult> {
  if (!canImpersonate(input.actorPermissions)) {
    throw new ImpersonationError("You do not have permission to view the site as a customer.");
  }
  const profile = await prisma.clientProfile.findUnique({
    where: { id: input.clientProfileId },
    include: { user: { include: { roles: { select: { roleId: true } }, staffProfile: { select: { id: true } } } } },
  });
  if (!profile) throw new ImpersonationError("Customer not found.");
  const { user } = profile;
  if (user.type !== "CLIENT" || user.roles.length > 0 || user.staffProfile) {
    throw new ImpersonationError("Staff accounts can't be viewed as a customer.");
  }
  if (!user.isActive) throw new ImpersonationError("This customer account is deactivated.");

  const sessionToken = await createSession(user.id, IMPERSONATION_TTL_SECONDS);
  const markerId = randomBytes(24).toString("hex");
  const clientName = profile.fullName.trim() || user.email || user.phone || "Customer";
  const record: ImpersonationRecord = {
    actorUserId: input.actorUserId,
    clientUserId: user.id,
    clientProfileId: profile.id,
    clientName,
    sessionToken,
    startedAt: new Date().toISOString(),
  };
  await getRedis().set(markerKey(markerId), JSON.stringify(record), "EX", IMPERSONATION_TTL_SECONDS);

  await recordAudit({
    actorUserId: input.actorUserId,
    action: "customer.view_as.start",
    entityType: "ClientProfile",
    entityId: profile.id,
    summary: `Opened the customer view as ${clientName} (1-hour session)`,
  });

  return { sessionToken, markerId, clientName, locale: user.locale === "en" ? "en" : "ar" };
}

export async function getImpersonation(markerId: string | undefined): Promise<ImpersonationRecord | null> {
  if (!markerId || !/^[a-f0-9]{48}$/.test(markerId)) return null;
  const raw = await getRedis().get(markerKey(markerId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImpersonationRecord;
  } catch {
    return null;
  }
}

/** Ends a preview: destroys the client session and the marker, and audits it. */
export async function endImpersonation(markerId: string | undefined): Promise<ImpersonationRecord | null> {
  const record = await getImpersonation(markerId);
  if (!record || !markerId) return null;
  await destroySession(record.sessionToken);
  await getRedis().del(markerKey(markerId));
  await recordAudit({
    actorUserId: record.actorUserId,
    action: "customer.view_as.end",
    entityType: "ClientProfile",
    entityId: record.clientProfileId,
    summary: `Exited the customer view of ${record.clientName}`,
  });
  return record;
}
