// Clearly-labelled test customers (tag "test", e.g. the `pnpm demo:customer`
// account) stay visible in the customer roster so staff can find them, but
// are left out of the business numbers: dashboards, reports, marketing
// attribution and LTV rankings.

import { prisma } from "@/lib/db";

export const TEST_CUSTOMER_TAG = "test";

/** Prisma ClientProfile filter: not a test customer. */
export const NOT_TEST_CLIENT = { NOT: { tags: { has: TEST_CUSTOMER_TAG } } };

export async function testClientIds(): Promise<Set<string>> {
  const rows = await prisma.clientProfile.findMany({ where: { tags: { has: TEST_CUSTOMER_TAG } }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}
