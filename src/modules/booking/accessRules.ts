// Enforces per-service minimum membership tier gates (ServiceAccessRule).
// A service with no ServiceAccessRule row (or one whose minTierId is null)
// is open to every client, including online guests.

import { prisma } from "@/lib/db";

export interface MinTierRequirement {
  minTierId: string;
  minPriority: number;
  tierName: string;
}

// Returns the minimum-tier requirement for `serviceId`, or null if the
// service has no access rule (open to all) or the rule has no minTierId set.
export async function getMinTierForService(serviceId: string): Promise<MinTierRequirement | null> {
  const rule = await prisma.serviceAccessRule.findUnique({ where: { serviceId } });
  if (!rule?.minTierId) return null;

  const tier = await prisma.membershipTier.findUnique({ where: { id: rule.minTierId } });
  if (!tier) return null; // Soft reference: tier may have been removed.

  return { minTierId: tier.id, minPriority: tier.priority, tierName: tier.name };
}

// Batch lookup for the public service picker: returns a map of
// serviceId -> tier display name for every service in `serviceIds` that
// carries a ServiceAccessRule with a minTierId set. Services with no rule
// (or a rule with minTierId null) are simply absent from the result — the
// picker uses this to render an informational "Members-only" note, but the
// actual gate is still enforced server-side by createBooking.
export async function getTierGateNotesForServices(serviceIds: string[]): Promise<Record<string, string>> {
  if (serviceIds.length === 0) return {};

  const rules = await prisma.serviceAccessRule.findMany({
    where: { serviceId: { in: serviceIds }, minTierId: { not: null } },
  });
  if (rules.length === 0) return {};

  const tierIds = [...new Set(rules.map((rule) => rule.minTierId).filter((id): id is string => !!id))];
  const tiers = await prisma.membershipTier.findMany({ where: { id: { in: tierIds } } });
  const tierNameById = new Map(tiers.map((tier) => [tier.id, tier.name]));

  const notes: Record<string, string> = {};
  for (const rule of rules) {
    const tierName = rule.minTierId ? tierNameById.get(rule.minTierId) : undefined;
    if (tierName) notes[rule.serviceId] = tierName;
  }
  return notes;
}

// Compares the client's current membership tier priority against
// `minPriority`. A client with no ClientMembership row is treated as the
// base "guest" tier (priority 0) -- this covers both online guests who have
// never been assigned a membership and walk-ins with no tier on file.
export async function clientMeetsTier(clientProfileId: string, minPriority: number): Promise<boolean> {
  const membership = await prisma.clientMembership.findUnique({
    where: { clientId: clientProfileId },
    include: { tier: true },
  });
  const clientPriority = membership?.tier.priority ?? 0;
  return clientPriority >= minPriority;
}
