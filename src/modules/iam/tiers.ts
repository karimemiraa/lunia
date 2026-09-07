import { prisma } from "@/lib/db";
import type { MembershipTier } from "@prisma/client";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export interface CreateTierInput {
  key: string;
  name: string;
  priority?: number;
  discountPct?: number;
}

export interface UpdateTierInput {
  name?: string;
  priority?: number;
  discountPct?: number;
}

function assertValidKey(key: string): void {
  if (!SLUG_PATTERN.test(key)) {
    throw new Error(`Invalid tier key "${key}": must be lowercase letters, digits, and hyphens only`);
  }
}

function assertValidDiscountPct(discountPct: number | undefined): void {
  if (discountPct === undefined) return;
  if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) {
    throw new Error(`Invalid discountPct "${discountPct}": must be between 0 and 100`);
  }
}

export async function listTiers(): Promise<MembershipTier[]> {
  return prisma.membershipTier.findMany({ orderBy: { priority: "asc" } });
}

export async function createTier(input: CreateTierInput): Promise<MembershipTier> {
  assertValidKey(input.key);
  assertValidDiscountPct(input.discountPct);

  const existing = await prisma.membershipTier.findUnique({ where: { key: input.key } });
  if (existing) {
    throw new Error(`Tier with key "${input.key}" already exists`);
  }

  return prisma.membershipTier.create({
    data: {
      key: input.key,
      name: input.name,
      priority: input.priority ?? 0,
      discountPct: input.discountPct ?? 0,
    },
  });
}

export async function updateTier(id: string, input: UpdateTierInput): Promise<MembershipTier> {
  assertValidDiscountPct(input.discountPct);

  const existing = await prisma.membershipTier.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Tier "${id}" not found`);
  }

  return prisma.membershipTier.update({
    where: { id },
    data: {
      name: input.name,
      priority: input.priority,
      discountPct: input.discountPct,
    },
  });
}

export async function deleteTier(id: string): Promise<void> {
  const tier = await prisma.membershipTier.findUnique({ where: { id } });
  if (!tier) {
    throw new Error(`Tier "${id}" not found`);
  }
  if (tier.isSystem) {
    throw new Error(`Cannot delete system tier "${tier.key}"`);
  }

  await prisma.membershipTier.delete({ where: { id } });
}
