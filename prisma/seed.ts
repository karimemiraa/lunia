import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { ALL_PERMISSION_KEYS, ROLE_PERMISSIONS } from "../src/modules/iam/permissions";
import type {
  BusinessSettings,
  HoursSettings,
  SocialSettings,
  SeoSettings,
  HeroSettings,
} from "../src/modules/cms/settings";
import bcrypt from "bcryptjs";

// Prisma 7 removed the `url` field from the schema's datasource block and
// requires a driver adapter to be passed to the PrismaClient constructor
// (mirrors src/lib/db.ts). We load .env ourselves since this script runs
// outside of Next.js.
try {
  process.loadEnvFile();
} catch {
  // No .env file present (e.g. in CI where vars are injected directly) — ignore.
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.location.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", name: "Lunia Riyadh", isDefault: true },
  });

  for (const key of ALL_PERMISSION_KEYS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }

  const roleNames: Record<string, string> = {
    owner: "Owner",
    manager: "Manager",
    reception: "Reception",
    specialist: "Specialist",
    marketing: "Marketing",
    client: "Client",
  };
  for (const [key, name] of Object.entries(roleNames)) {
    const role = await prisma.role.upsert({
      where: { key },
      update: {},
      create: { key, name, isSystem: true },
    });
    const perms = ROLE_PERMISSIONS[key] ?? [];
    for (const pkey of perms) {
      const perm = await prisma.permission.findUnique({ where: { key: pkey } });
      if (perm) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
          update: {},
          create: { roleId: role.id, permissionId: perm.id },
        });
      }
    }
  }

  const tiers = [
    { key: "guest", name: "Guest", priority: 0, discountPct: 0 },
    { key: "member", name: "Member", priority: 10, discountPct: 5 },
    { key: "vip", name: "VIP", priority: 20, discountPct: 10 },
    { key: "bride", name: "Bride Program", priority: 15, discountPct: 0 },
    { key: "postsurgery", name: "Post-Surgery Program", priority: 15, discountPct: 0 },
  ];
  for (const t of tiers) {
    await prisma.membershipTier.upsert({
      where: { key: t.key },
      update: {},
      create: { ...t, isSystem: true },
    });
  }

  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "owner@lunia.local";
  const ownerPass = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { key: "owner" } });
  const user = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: {
      type: "STAFF",
      email: ownerEmail,
      passwordHash: await bcrypt.hash(ownerPass, 12),
      locale: "en",
      staffProfile: { create: { fullName: "Lunia Owner", title: "Founder" } },
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: ownerRole.id } },
    update: {},
    create: { userId: user.id, roleId: ownerRole.id },
  });
  const openHours = { open: "10:00", close: "22:00", closed: false };
  const closedHours = { open: "10:00", close: "22:00", closed: true };
  const defaultSettings: Record<string, unknown> = {
    business: {
      nameEn: "Lunia",
      nameAr: "لونيا",
      addressEn: "King Fahd Road, Riyadh, Saudi Arabia",
      addressAr: "طريق الملك فهد، الرياض، المملكة العربية السعودية",
      phone: "+9665XXXXXXXX",
      whatsapp: "+9665XXXXXXXX",
      email: "hello@lunia.example",
    } satisfies BusinessSettings,
    hours: {
      sun: openHours,
      mon: openHours,
      tue: openHours,
      wed: openHours,
      thu: openHours,
      fri: closedHours,
      sat: openHours,
    } satisfies HoursSettings,
    social: {
      instagram: "@lunia",
    } satisfies SocialSettings,
    seo: {
      defaultTitleEn: "Lunia — Skin Quality Center",
      defaultTitleAr: "لونيا — مركز جودة البشرة",
      defaultDescEn: "Lunia is a premium skin quality center in Riyadh offering advanced, personalized skincare treatments.",
      defaultDescAr: "لونيا مركز متميز لجودة البشرة في الرياض يقدم علاجات عناية بالبشرة متقدمة ومخصصة.",
    } satisfies SeoSettings,
    hero: {
      mediaId: null,
      headlineEn: "Where natural beauty begins",
      headlineAr: "حيث يبدأ الجمال الطبيعي",
      ctaEn: "Book Now",
      ctaAr: "احجزي الآن",
    } satisfies HeroSettings,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await prisma.siteSetting.upsert({
      where: { key },
      update: {},
      create: { key, value: value as object },
    });
  }

  console.log("Seed complete. Owner:", ownerEmail);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
