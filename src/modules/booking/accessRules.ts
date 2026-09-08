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
