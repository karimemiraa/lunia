import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "@/lib/env";

// Prisma 7 removed the `url` field from the schema's datasource block and
// requires a driver adapter to be passed to the PrismaClient constructor
// (the schema/migration-time connection string still lives in
// prisma.config.ts). We construct that adapter from the same DATABASE_URL.
const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
