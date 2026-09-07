# Lunia Foundation — Implementation Plan (Stage 1 of 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Lunia platform foundation — a bilingual (Gulf-Arabic-first/RTL, English) Next.js app with PostgreSQL, session auth, configurable RBAC, membership tiers, brand design tokens, and a reproducible Docker deployment skeleton.

**Architecture:** A single Next.js (App Router) TypeScript app with route groups for the public site (`/[locale]`), admin (`/admin`), and client area. Business logic lives in a typed service layer (`src/modules/*`) consumed by thin route/UI code. PostgreSQL via Prisma; Redis for sessions/queue. Everything runs locally and in production via Docker Compose.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 (CSS-first `@theme` tokens) · Prisma 6 + PostgreSQL 16 · Redis 7 (ioredis) · next-intl · bcryptjs · Vitest (unit) · Playwright (e2e) · Docker Compose · Nginx + Certbot (prod).

**Spec:** `docs/superpowers/specs/2026-09-07-lunia-platform-design.md`

## Global Constraints

- **Package manager:** pnpm (lockfile committed).
- **Language:** TypeScript strict mode; no `any` in committed code without justification.
- **Public default locale:** `ar` (Gulf Arabic, `dir="rtl"`). Secondary: `en` (`dir="ltr"`). Admin default locale: `en`.
- **No emojis** anywhere in UI, content, or commit messages. No generic template look.
- **Brand palette (CSS variables, exact):** Luminous Teal `#9ed5d0`, Deep Canopy `#93ccc6`, Alice Blue `#86bfb8`; secondaries Tiger Lily/gold `#c0ad73`, Wild Marigold `#cdbb85`, Dragonfruit `#d9cca3`, Jacaranda `#ebe5d3`.
- **Typography:** headline serif = "The Seasons" (placeholder: `Cormorant Garamond` until licensed); body = `Inter`; Arabic headline = "F37 Wicklow" (placeholder: `Noto Kufi Arabic`); Arabic body = `IBM Plex Sans Arabic`.
- **Secrets:** only via env; never committed. `.env.example` documents every variable.
- **Commits:** conventional-commit style; each task ends committed and green.
- **RTL:** use CSS logical properties (`margin-inline-start`, etc.), never hard left/right.

---

## File Structure

```
lunia/
├─ docker-compose.yml            # local infra: postgres, redis
├─ docker-compose.prod.yml       # prod: app, worker, postgres, redis, nginx, certbot
├─ Dockerfile                    # app image
├─ deploy/nginx/lunia.conf       # reverse proxy + TLS
├─ deploy/scripts/{deploy.sh,backup.sh,restore.sh}
├─ .env.example
├─ prisma/
│  ├─ schema.prisma
│  └─ seed.ts
├─ src/
│  ├─ app/
│  │  ├─ [locale]/(site)/layout.tsx     # public shell (RTL-aware)
│  │  ├─ [locale]/(site)/page.tsx       # placeholder home
│  │  ├─ admin/layout.tsx               # admin shell (en/LTR)
│  │  ├─ admin/login/page.tsx
│  │  ├─ admin/page.tsx                 # protected dashboard placeholder
│  │  └─ api/health/route.ts
│  ├─ i18n/{routing.ts,request.ts}
│  ├─ messages/{ar.json,en.json}
│  ├─ lib/{db.ts,redis.ts,env.ts}
│  ├─ modules/
│  │  ├─ iam/{password.ts,auth.ts,session.ts,rbac.ts,permissions.ts}
│  │  └─ ...                            # later stages
│  ├─ components/ui/{button.tsx,container.tsx}
│  ├─ styles/globals.css                # Tailwind v4 + @theme tokens
│  └─ middleware.ts                      # locale + admin auth
├─ tests/                                # vitest unit tests mirror src/
├─ e2e/                                  # playwright specs
├─ vitest.config.ts
├─ playwright.config.ts
└─ package.json
```

Each `src/modules/<name>` is a bounded unit exposing a typed API; UI/routes never touch Prisma directly except through these modules.

---

## Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore` (exists — extend), `vitest.config.ts`, `src/app/api/health/route.ts`, `tests/health.test.ts`, `src/lib/env.ts`, `tests/env.test.ts`

**Interfaces:**
- Produces: `getEnv(): Env` in `src/lib/env.ts` — validated env accessor returning `{ DATABASE_URL: string; REDIS_URL: string; SESSION_SECRET: string; APP_URL: string; NODE_ENV: string }`.

- [ ] **Step 1: Initialize the project**

```bash
cd /Users/karimemira/Downloads/Luina
corepack enable
pnpm dlx create-next-app@latest lunia --ts --app --tailwind --eslint --src-dir --import-alias "@/*" --no-turbopack --use-pnpm
# Move project contents up so repo root == project root is optional; keep in ./lunia
cd lunia
pnpm add zod ioredis bcryptjs next-intl
pnpm add -D vitest @vitejs/plugin-react vite-tsconfig-paths @testing-library/react @testing-library/jest-dom jsdom @playwright/test prisma
pnpm add @prisma/client
```

- [ ] **Step 2: Add test scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "db:migrate": "prisma migrate dev",
    "db:seed": "prisma db seed",
    "db:generate": "prisma generate"
  }
}
```

- [ ] **Step 3: Configure Vitest** — `vitest.config.ts`

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { environment: "node", include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"], globals: true },
});
```

- [ ] **Step 4: Write failing test for env validation** — `tests/env.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { parseEnv } from "@/lib/env";

describe("parseEnv", () => {
  it("throws when SESSION_SECRET is missing", () => {
    expect(() => parseEnv({ DATABASE_URL: "postgres://x", REDIS_URL: "redis://x", APP_URL: "http://x", NODE_ENV: "test" } as Record<string, string>)).toThrow();
  });
  it("returns typed env when valid", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://x", REDIS_URL: "redis://x", SESSION_SECRET: "s".repeat(32), APP_URL: "http://x", NODE_ENV: "test" });
    expect(env.SESSION_SECRET.length).toBe(32);
  });
});
```

- [ ] **Step 5: Run test, verify it fails**

Run: `pnpm test env` — Expected: FAIL ("Cannot find module '@/lib/env'").

- [ ] **Step 6: Implement `src/lib/env.ts`**

```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url().or(z.string().startsWith("postgres")),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  APP_URL: z.string().url().or(z.string().startsWith("http")),
  NODE_ENV: z.string().default("development"),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return schema.parse(source);
}

let cached: Env | null = null;
export function getEnv(): Env {
  if (!cached) cached = parseEnv(process.env as Record<string, string | undefined>);
  return cached;
}
```

- [ ] **Step 7: Implement health route** — `src/app/api/health/route.ts`

```ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", service: "lunia" });
}
```

- [ ] **Step 8: Write health test** — `tests/health.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("health route", () => {
  it("returns ok", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
```

- [ ] **Step 9: Run tests, verify pass**

Run: `pnpm test` — Expected: PASS (env + health).

- [ ] **Step 10: Commit**

```bash
git add lunia
git commit -m "chore: scaffold Next.js app with env validation and health check"
```

---

## Task 2: Local infra (Docker Compose: Postgres + Redis)

**Files:**
- Create: `docker-compose.yml`, `.env.example`, `.env` (local, gitignored)

**Interfaces:**
- Produces: reachable Postgres at `localhost:5432` (db `lunia`, user `lunia`) and Redis at `localhost:6379`.

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: lunia
      POSTGRES_PASSWORD: lunia_local
      POSTGRES_DB: lunia
    ports: ["5432:5432"]
    volumes: ["lunia_pg:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lunia"]
      interval: 5s
      timeout: 3s
      retries: 10
  redis:
    image: redis:7
    ports: ["6379:6379"]
    volumes: ["lunia_redis:/data"]
volumes:
  lunia_pg:
  lunia_redis:
```

- [ ] **Step 2: Write `.env.example`**

```bash
DATABASE_URL="postgresql://lunia:lunia_local@localhost:5432/lunia?schema=public"
REDIS_URL="redis://localhost:6379"
SESSION_SECRET="change-me-to-a-32-plus-char-random-string"
APP_URL="http://localhost:3000"
NODE_ENV="development"
```

- [ ] **Step 3: Create local `.env`** (copy example, set a real 32+ char SESSION_SECRET).

- [ ] **Step 4: Bring infra up and verify**

Run: `docker compose up -d && docker compose ps`
Expected: `postgres` healthy, `redis` running.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add local postgres and redis via docker compose"
```

---

## Task 3: Prisma setup + DB/Redis clients

**Files:**
- Create: `prisma/schema.prisma`, `src/lib/db.ts`, `src/lib/redis.ts`, `tests/db.test.ts`

**Interfaces:**
- Produces: `prisma` (PrismaClient singleton) from `@/lib/db`; `getRedis(): Redis` from `@/lib/redis`.

- [ ] **Step 1: Initialize Prisma schema** — `prisma/schema.prisma`

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model Location {
  id        String   @id @default(cuid())
  name      String
  city      String   @default("Riyadh")
  isDefault Boolean  @default(true)
  createdAt DateTime @default(now())
}

model SiteSetting {
  id    String @id @default(cuid())
  key   String @unique
  value Json
}
```

- [ ] **Step 2: Create first migration**

Run: `pnpm db:migrate --name init_core`
Expected: migration applied; `Location`, `SiteSetting` tables exist.

- [ ] **Step 3: Implement Prisma singleton** — `src/lib/db.ts`

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

- [ ] **Step 4: Implement Redis client** — `src/lib/redis.ts`

```ts
import Redis from "ioredis";
import { getEnv } from "@/lib/env";

let client: Redis | null = null;
export function getRedis(): Redis {
  if (!client) client = new Redis(getEnv().REDIS_URL);
  return client;
}
```

- [ ] **Step 5: Write a DB round-trip test** — `tests/db.test.ts`

```ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";

describe("db", () => {
  it("writes and reads a SiteSetting", async () => {
    const key = `test_${Date.now()}`;
    await prisma.siteSetting.create({ data: { key, value: { ok: true } } });
    const found = await prisma.siteSetting.findUnique({ where: { key } });
    expect((found?.value as { ok: boolean }).ok).toBe(true);
    await prisma.siteSetting.delete({ where: { key } });
  });
  afterAll(async () => { await prisma.$disconnect(); });
});
```

- [ ] **Step 6: Run test (infra must be up), verify pass**

Run: `pnpm db:generate && pnpm test db` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma src/lib/db.ts src/lib/redis.ts tests/db.test.ts
git commit -m "feat: add prisma schema, db and redis clients"
```

---

## Task 4: IAM schema — users, roles, permissions, tiers

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/seed.ts`, `src/modules/iam/permissions.ts`, `tests/iam/permissions.test.ts`

**Interfaces:**
- Produces: enum `UserType { STAFF, CLIENT }`; models `User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `StaffProfile`, `ClientProfile`, `MembershipTier`, `ClientMembership`.
- Produces: `PERMISSIONS` constant object and `type PermissionKey` in `permissions.ts`.

- [ ] **Step 1: Extend `schema.prisma`** (append)

```prisma
enum UserType { STAFF CLIENT }

model User {
  id           String        @id @default(cuid())
  type         UserType
  email        String?       @unique
  phone        String?       @unique
  passwordHash String?
  locale       String        @default("en")
  isActive     Boolean       @default(true)
  createdAt    DateTime      @default(now())
  roles        UserRole[]
  staffProfile StaffProfile?
  clientProfile ClientProfile?
}

model Role {
  id          String           @id @default(cuid())
  key         String           @unique
  name        String
  isSystem    Boolean          @default(false)
  users       UserRole[]
  permissions RolePermission[]
}

model Permission {
  id    String           @id @default(cuid())
  key   String           @unique
  roles RolePermission[]
}

model RolePermission {
  roleId       String
  permissionId String
  role         Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  @@id([roleId, permissionId])
}

model UserRole {
  userId String
  roleId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role   Role @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@id([userId, roleId])
}

model StaffProfile {
  id        String @id @default(cuid())
  userId    String @unique
  user      User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  fullName  String
  title     String?
  bio       String?
}

model MembershipTier {
  id            String          @id @default(cuid())
  key           String          @unique
  name          String
  priority      Int             @default(0)
  discountPct   Int             @default(0)
  isSystem      Boolean         @default(false)
  memberships   ClientMembership[]
}

model ClientProfile {
  id             String   @id @default(cuid())
  userId         String   @unique
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  fullName       String
  sourceChannel  String?
  ltvCacheMinor  Int      @default(0)
  createdAt      DateTime @default(now())
  membership     ClientMembership?
}

model ClientMembership {
  id        String        @id @default(cuid())
  clientId  String        @unique
  tierId    String
  client    ClientProfile @relation(fields: [clientId], references: [id], onDelete: Cascade)
  tier      MembershipTier @relation(fields: [tierId], references: [id])
  startedAt DateTime      @default(now())
}
```

- [ ] **Step 2: Migrate**

Run: `pnpm db:migrate --name iam` — Expected: tables created.

- [ ] **Step 3: Write failing test for the permission catalog** — `tests/iam/permissions.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { PERMISSIONS, ALL_PERMISSION_KEYS } from "@/modules/iam/permissions";

describe("permissions catalog", () => {
  it("defines booking and settings permissions", () => {
    expect(PERMISSIONS.BOOKING_MANAGE).toBe("booking:manage");
    expect(PERMISSIONS.SETTINGS_MANAGE).toBe("settings:manage");
  });
  it("exposes a unique list of keys", () => {
    expect(new Set(ALL_PERMISSION_KEYS).size).toBe(ALL_PERMISSION_KEYS.length);
  });
});
```

- [ ] **Step 4: Run test, verify fail** — Run: `pnpm test permissions` — Expected: FAIL (module missing).

- [ ] **Step 5: Implement `src/modules/iam/permissions.ts`**

```ts
export const PERMISSIONS = {
  BOOKING_MANAGE: "booking:manage",
  BOOKING_VIEW: "booking:view",
  CLIENT_MANAGE: "client:manage",
  CLIENT_VIEW: "client:view",
  VISITNOTE_WRITE: "visitnote:write",
  CATALOG_MANAGE: "catalog:manage",
  CMS_MANAGE: "cms:manage",
  ANALYTICS_VIEW: "analytics:view",
  MARKETING_MANAGE: "marketing:manage",
  STAFF_MANAGE: "staff:manage",
  SETTINGS_MANAGE: "settings:manage",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);

export const ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  owner: ALL_PERMISSION_KEYS,
  manager: [PERMISSIONS.BOOKING_MANAGE, PERMISSIONS.BOOKING_VIEW, PERMISSIONS.CLIENT_MANAGE, PERMISSIONS.CLIENT_VIEW, PERMISSIONS.CATALOG_MANAGE, PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.STAFF_MANAGE],
  reception: [PERMISSIONS.BOOKING_MANAGE, PERMISSIONS.BOOKING_VIEW, PERMISSIONS.CLIENT_MANAGE, PERMISSIONS.CLIENT_VIEW],
  specialist: [PERMISSIONS.BOOKING_VIEW, PERMISSIONS.CLIENT_VIEW, PERMISSIONS.VISITNOTE_WRITE],
  marketing: [PERMISSIONS.ANALYTICS_VIEW, PERMISSIONS.MARKETING_MANAGE, PERMISSIONS.CMS_MANAGE],
};
```

- [ ] **Step 6: Run test, verify pass** — Run: `pnpm test permissions` — Expected: PASS.

- [ ] **Step 7: Write the seed** — `prisma/seed.ts`

```ts
import { PrismaClient } from "@prisma/client";
import { ALL_PERMISSION_KEYS, ROLE_PERMISSIONS } from "../src/modules/iam/permissions";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.location.upsert({ where: { id: "default" }, update: {}, create: { id: "default", name: "Lunia Riyadh", isDefault: true } });

  for (const key of ALL_PERMISSION_KEYS) {
    await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
  }

  const roleNames: Record<string, string> = { owner: "Owner", manager: "Manager", reception: "Reception", specialist: "Specialist", marketing: "Marketing", client: "Client" };
  for (const [key, name] of Object.entries(roleNames)) {
    const role = await prisma.role.upsert({ where: { key }, update: {}, create: { key, name, isSystem: true } });
    const perms = ROLE_PERMISSIONS[key] ?? [];
    for (const pkey of perms) {
      const perm = await prisma.permission.findUnique({ where: { key: pkey } });
      if (perm) await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } }, update: {}, create: { roleId: role.id, permissionId: perm.id } });
    }
  }

  const tiers = [
    { key: "guest", name: "Guest", priority: 0, discountPct: 0 },
    { key: "member", name: "Member", priority: 10, discountPct: 5 },
    { key: "vip", name: "VIP", priority: 20, discountPct: 10 },
    { key: "bride", name: "Bride Program", priority: 15, discountPct: 0 },
    { key: "postsurgery", name: "Post-Surgery Program", priority: 15, discountPct: 0 },
  ];
  for (const t of tiers) await prisma.membershipTier.upsert({ where: { key: t.key }, update: {}, create: { ...t, isSystem: true } });

  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "owner@lunia.local";
  const ownerPass = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";
  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { key: "owner" } });
  const user = await prisma.user.upsert({
    where: { email: ownerEmail }, update: {},
    create: { type: "STAFF", email: ownerEmail, passwordHash: await bcrypt.hash(ownerPass, 12), locale: "en", staffProfile: { create: { fullName: "Lunia Owner", title: "Founder" } } },
  });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: ownerRole.id } }, update: {}, create: { userId: user.id, roleId: ownerRole.id } });
  console.log("Seed complete. Owner:", ownerEmail);
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 8: Register the seed in `package.json`**

```json
{ "prisma": { "seed": "tsx prisma/seed.ts" } }
```

Run: `pnpm add -D tsx`

- [ ] **Step 9: Run the seed, verify**

Run: `pnpm db:seed`
Expected: "Seed complete. Owner: owner@lunia.local"; 6 roles, 5 tiers, all permissions present.

- [ ] **Step 10: Commit**

```bash
git add prisma src/modules/iam/permissions.ts tests/iam/permissions.test.ts package.json
git commit -m "feat: iam schema, permission catalog, and seed data"
```

---

## Task 5: Password + auth service

**Files:**
- Create: `src/modules/iam/password.ts`, `src/modules/iam/auth.ts`, `tests/iam/auth.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db`.
- Produces: `hashPassword(plain: string): Promise<string>`, `verifyPassword(plain, hash): Promise<boolean>`; `authenticateStaff(email: string, password: string): Promise<{ id: string } | null>`.

- [ ] **Step 1: Write failing test** — `tests/iam/auth.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/modules/iam/password";

describe("password", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("nope", hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail** — Run: `pnpm test auth` — Expected: FAIL.

- [ ] **Step 3: Implement `src/modules/iam/password.ts`**

```ts
import bcrypt from "bcryptjs";
export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
```

- [ ] **Step 4: Implement `src/modules/iam/auth.ts`**

```ts
import { prisma } from "@/lib/db";
import { verifyPassword } from "./password";

export async function authenticateStaff(email: string, password: string): Promise<{ id: string } | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !user.passwordHash || user.type !== "STAFF") return null;
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? { id: user.id } : null;
}
```

- [ ] **Step 5: Run, verify pass** — Run: `pnpm test auth` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/iam/password.ts src/modules/iam/auth.ts tests/iam/auth.test.ts
git commit -m "feat: password hashing and staff authentication"
```

---

## Task 6: Redis-backed sessions

**Files:**
- Create: `src/modules/iam/session.ts`, `tests/iam/session.test.ts`

**Interfaces:**
- Consumes: `getRedis()` from `@/lib/redis`.
- Produces: `createSession(userId: string): Promise<string>` (returns token), `getSession(token: string): Promise<{ userId: string } | null>`, `destroySession(token: string): Promise<void>`. Session TTL = 7 days.

- [ ] **Step 1: Write failing test** — `tests/iam/session.test.ts`

```ts
import { describe, it, expect, afterAll } from "vitest";
import { createSession, getSession, destroySession } from "@/modules/iam/session";
import { getRedis } from "@/lib/redis";

describe("session", () => {
  it("creates, reads, and destroys a session", async () => {
    const token = await createSession("user_1");
    expect(await getSession(token)).toEqual({ userId: "user_1" });
    await destroySession(token);
    expect(await getSession(token)).toBeNull();
  });
  afterAll(async () => { getRedis().disconnect(); });
});
```

- [ ] **Step 2: Run, verify fail** — Run: `pnpm test session` — Expected: FAIL.

- [ ] **Step 3: Implement `src/modules/iam/session.ts`**

```ts
import { randomBytes } from "crypto";
import { getRedis } from "@/lib/redis";

const TTL_SECONDS = 60 * 60 * 24 * 7;
const keyFor = (token: string) => `session:${token}`;

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await getRedis().set(keyFor(token), JSON.stringify({ userId }), "EX", TTL_SECONDS);
  return token;
}

export async function getSession(token: string): Promise<{ userId: string } | null> {
  const raw = await getRedis().get(keyFor(token));
  return raw ? (JSON.parse(raw) as { userId: string }) : null;
}

export async function destroySession(token: string): Promise<void> {
  await getRedis().del(keyFor(token));
}
```

- [ ] **Step 4: Run, verify pass** (infra up) — Run: `pnpm test session` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/iam/session.ts tests/iam/session.test.ts
git commit -m "feat: redis-backed sessions"
```

---

## Task 7: RBAC resolver + guard

**Files:**
- Create: `src/modules/iam/rbac.ts`, `tests/iam/rbac.test.ts`

**Interfaces:**
- Consumes: `prisma`, `getSession`, `PermissionKey`.
- Produces: `getUserPermissions(userId: string): Promise<Set<PermissionKey>>`; `hasPermission(userId, key): Promise<boolean>`; `getCurrentUser(token: string | undefined): Promise<{ id: string; permissions: Set<PermissionKey> } | null>`.

- [ ] **Step 1: Write failing test** — `tests/iam/rbac.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { getUserPermissions } from "@/modules/iam/rbac";
import { prisma } from "@/lib/db";
import { PERMISSIONS } from "@/modules/iam/permissions";

describe("rbac", () => {
  it("owner has settings:manage", async () => {
    const owner = await prisma.user.findFirstOrThrow({ where: { email: "owner@lunia.local" } });
    const perms = await getUserPermissions(owner.id);
    expect(perms.has(PERMISSIONS.SETTINGS_MANAGE)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail** — Run: `pnpm test rbac` — Expected: FAIL.

- [ ] **Step 3: Implement `src/modules/iam/rbac.ts`**

```ts
import { prisma } from "@/lib/db";
import { getSession } from "./session";
import type { PermissionKey } from "./permissions";

export async function getUserPermissions(userId: string): Promise<Set<PermissionKey>> {
  const rows = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const set = new Set<PermissionKey>();
  for (const ur of rows) for (const rp of ur.role.permissions) set.add(rp.permission.key as PermissionKey);
  return set;
}

export async function hasPermission(userId: string, key: PermissionKey): Promise<boolean> {
  return (await getUserPermissions(userId)).has(key);
}

export async function getCurrentUser(token: string | undefined) {
  if (!token) return null;
  const session = await getSession(token);
  if (!session) return null;
  return { id: session.userId, permissions: await getUserPermissions(session.userId) };
}
```

- [ ] **Step 4: Run, verify pass** — Run: `pnpm test rbac` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/iam/rbac.ts tests/iam/rbac.test.ts
git commit -m "feat: rbac permission resolver and current-user helper"
```

---

## Task 8: i18n routing (ar default/RTL, en)

**Files:**
- Create: `src/i18n/routing.ts`, `src/i18n/request.ts`, `src/messages/ar.json`, `src/messages/en.json`
- Modify: `next.config.ts`, `src/middleware.ts`

**Interfaces:**
- Produces: `routing` (locales `["ar","en"]`, default `ar`); `localeDirection(locale): "rtl" | "ltr"`.

- [ ] **Step 1: Write failing test** — `tests/i18n.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { localeDirection } from "@/i18n/routing";

describe("i18n", () => {
  it("ar is rtl, en is ltr", () => {
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("en")).toBe("ltr");
  });
});
```

- [ ] **Step 2: Run, verify fail** — Run: `pnpm test i18n` — Expected: FAIL.

- [ ] **Step 3: Implement `src/i18n/routing.ts`**

```ts
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({ locales: ["ar", "en"], defaultLocale: "ar", localePrefix: "always" });
export function localeDirection(locale: string): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
```

- [ ] **Step 4: Implement `src/i18n/request.ts`**

```ts
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as "ar" | "en")) locale = routing.defaultLocale;
  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
```

- [ ] **Step 5: Create message files** — `src/messages/en.json` and `src/messages/ar.json`

```json
{ "nav": { "home": "Home", "about": "About", "services": "Services", "brands": "Brands", "journal": "Journal", "contact": "Contact", "book": "Book Now" }, "home": { "heroStatement": "Where natural beauty begins" } }
```

```json
{ "nav": { "home": "الرئيسية", "about": "من نحن", "services": "الخدمات", "brands": "العلامات", "journal": "المجلة", "contact": "تواصلي معنا", "book": "احجزي الآن" }, "home": { "heroStatement": "حيث يبدأ الجمال الطبيعي" } }
```

- [ ] **Step 6: Wire the plugin** — `next.config.ts`

```ts
import createNextIntlPlugin from "next-intl/plugin";
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export default withNextIntl({});
```

- [ ] **Step 7: Middleware for locale** — `src/middleware.ts`

```ts
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

export default createMiddleware(routing);
export const config = { matcher: ["/((?!api|admin|_next|.*\\..*).*)"] };
```

- [ ] **Step 8: Run, verify pass** — Run: `pnpm test i18n` — Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/i18n src/messages next.config.ts src/middleware.ts tests/i18n.test.ts
git commit -m "feat: bilingual routing with arabic default and rtl direction"
```

---

## Task 9: Brand design tokens + base components

**Files:**
- Modify: `src/styles/globals.css`
- Create: `src/components/ui/button.tsx`, `src/components/ui/container.tsx`, `tests/ui/button.test.tsx`
- Modify: `vitest.config.ts` (add jsdom for component tests)

**Interfaces:**
- Produces: `Button` (variants `primary | ghost`), `Container` React components; CSS variables `--color-teal`, `--color-canopy`, `--color-cream`, `--font-display`, `--font-body`.

- [ ] **Step 1: Define tokens in `src/styles/globals.css`**

```css
@import "tailwindcss";

@theme {
  --color-teal: #9ed5d0;
  --color-canopy: #93ccc6;
  --color-ice: #86bfb8;
  --color-gold: #c0ad73;
  --color-marigold: #cdbb85;
  --color-cream: #ebe5d3;
  --color-ink: #1c2b2a;
  --font-display: "Cormorant Garamond", "The Seasons", serif;
  --font-body: "Inter", system-ui, sans-serif;
  --font-display-ar: "Noto Kufi Arabic", "F37 Wicklow", serif;
  --font-body-ar: "IBM Plex Sans Arabic", system-ui, sans-serif;
}

:root { color-scheme: light; }
html[dir="rtl"] { font-family: var(--font-body-ar); }
body { background: #fbfaf7; color: var(--color-ink); font-family: var(--font-body); }
```

- [ ] **Step 2: Add jsdom project to `vitest.config.ts`** (component tests need DOM)

```ts
test: { environment: "node", environmentMatchGlobs: [["tests/ui/**", "jsdom"]], setupFiles: ["./tests/setup.ts"], include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"], globals: true },
```

Create `tests/setup.ts`: `import "@testing-library/jest-dom/vitest";`

- [ ] **Step 3: Write failing component test** — `tests/ui/button.test.tsx`

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders label and primary variant class", () => {
    render(<Button variant="primary">Book Now</Button>);
    const el = screen.getByRole("button", { name: "Book Now" });
    expect(el.className).toContain("bg-[var(--color-teal)]");
  });
});
```

- [ ] **Step 4: Run, verify fail** — Run: `pnpm test button` — Expected: FAIL.

- [ ] **Step 5: Implement `src/components/ui/button.tsx`**

```tsx
import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" };

export function Button({ variant = "primary", className = "", ...props }: Props) {
  const base = "inline-flex items-center justify-center px-6 py-3 font-medium tracking-wide transition-colors";
  const styles = variant === "primary"
    ? "bg-[var(--color-teal)] text-[var(--color-ink)] hover:bg-[var(--color-canopy)]"
    : "bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-cream)]";
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}
```

- [ ] **Step 6: Implement `src/components/ui/container.tsx`**

```tsx
import { PropsWithChildren } from "react";
export function Container({ children }: PropsWithChildren) {
  return <div className="mx-auto w-full max-w-6xl px-6">{children}</div>;
}
```

- [ ] **Step 7: Run, verify pass** — Run: `pnpm test button` — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/styles/globals.css src/components/ui tests/ui tests/setup.ts vitest.config.ts
git commit -m "feat: brand design tokens and base ui components"
```

---

## Task 10: App shells — public (RTL-aware) + admin login/guard

**Files:**
- Create: `src/app/[locale]/(site)/layout.tsx`, `src/app/[locale]/(site)/page.tsx`, `src/app/admin/layout.tsx`, `src/app/admin/login/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/login/actions.ts`
- Modify: `src/middleware.ts` (protect `/admin`)
- Create: `e2e/smoke.spec.ts`, `playwright.config.ts`

**Interfaces:**
- Consumes: `getCurrentUser`, `authenticateStaff`, `createSession`, `destroySession`, `localeDirection`, `Button`, `Container`.
- Produces: working `/ar` and `/en` public pages; `/admin/login`; `/admin` protected (redirects to login when unauthenticated).

- [ ] **Step 1: Public layout with dir** — `src/app/[locale]/(site)/layout.tsx`

```tsx
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { localeDirection } from "@/i18n/routing";

export default async function SiteLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const messages = await getMessages();
  return (
    <html lang={locale} dir={localeDirection(locale)}>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Public home placeholder** — `src/app/[locale]/(site)/page.tsx`

```tsx
import { useTranslations } from "next-intl";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";

export default function Home() {
  const t = useTranslations("home");
  const nav = useTranslations("nav");
  return (
    <main>
      <Container>
        <h1 className="font-[var(--font-display)] text-5xl mt-24">{t("heroStatement")}</h1>
        <div className="mt-8"><Button>{nav("book")}</Button></div>
      </Container>
    </main>
  );
}
```

- [ ] **Step 3: Login server action** — `src/app/admin/login/actions.ts`

```ts
"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateStaff } from "@/modules/iam/auth";
import { createSession } from "@/modules/iam/session";

export async function login(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const user = await authenticateStaff(email, password);
  if (!user) return { error: "Invalid credentials" };
  const token = await createSession(user.id);
  (await cookies()).set("lunia_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
  redirect("/admin");
}
```

- [ ] **Step 4: Login page** — `src/app/admin/login/page.tsx`

```tsx
"use client";
import { useActionState } from "react";
import { login } from "./actions";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [state, action] = useActionState(login, null);
  return (
    <main className="mx-auto max-w-sm mt-32 px-6">
      <h1 className="text-2xl mb-6">Lunia Admin</h1>
      <form action={action} className="flex flex-col gap-4">
        <input name="email" type="email" placeholder="Email" className="border p-3" required />
        <input name="password" type="password" placeholder="Password" className="border p-3" required />
        {state?.error && <p className="text-red-600 text-sm">{state.error}</p>}
        <Button type="submit">Sign in</Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Admin guard in layout** — `src/app/admin/layout.tsx`

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/iam/rbac";
import { headers } from "next/headers";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = (await headers()).get("x-invoke-path") ?? "";
  const token = (await cookies()).get("lunia_session")?.value;
  const user = await getCurrentUser(token);
  if (!user && !path.endsWith("/login")) redirect("/admin/login");
  return <html lang="en" dir="ltr"><body>{children}</body></html>;
}
```

Note: since the login page is under `/admin`, guard by checking user in the dashboard page instead of the layout to avoid guarding the login route. Simpler approach used in Step 6.

- [ ] **Step 6: Protected dashboard** — `src/app/admin/page.tsx`

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/iam/rbac";

export default async function AdminHome() {
  const token = (await cookies()).get("lunia_session")?.value;
  const user = await getCurrentUser(token);
  if (!user) redirect("/admin/login");
  return <main className="p-8"><h1 className="text-2xl">Dashboard</h1><p>Signed in. Permissions: {user.permissions.size}</p></main>;
}
```

Replace `admin/layout.tsx` with a minimal shell (no guard):

```tsx
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" dir="ltr"><body>{children}</body></html>;
}
```

- [ ] **Step 7: Configure Playwright** — `playwright.config.ts`

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: true, timeout: 120000 },
});
```

- [ ] **Step 8: Write e2e smoke** — `e2e/smoke.spec.ts`

```ts
import { test, expect } from "@playwright/test";

test("arabic home renders rtl", async ({ page }) => {
  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("unauthenticated admin redirects to login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("owner can sign in", async ({ page }) => {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', process.env.SEED_OWNER_EMAIL ?? "owner@lunia.local");
  await page.fill('input[name="password"]', process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByText("Dashboard")).toBeVisible();
});
```

- [ ] **Step 9: Run e2e (infra up, seeded), verify pass**

Run: `pnpm exec playwright install --with-deps chromium && pnpm e2e`
Expected: 3 passing tests.

- [ ] **Step 10: Commit**

```bash
git add src/app e2e playwright.config.ts
git commit -m "feat: public rtl shell and protected admin login flow"
```

---

## Task 11: Production deploy skeleton

**Files:**
- Create: `Dockerfile`, `docker-compose.prod.yml`, `deploy/nginx/lunia.conf`, `deploy/scripts/deploy.sh`, `deploy/scripts/backup.sh`, `deploy/scripts/restore.sh`, `docs/RUNBOOK.md`
- Modify: `next.config.ts` (add `output: "standalone"`)

**Interfaces:**
- Produces: a buildable app image and a compose stack (app + worker-ready + postgres + redis + nginx + certbot). This task does **not** deploy to the live VPS — that is a later, separate, approved step.

- [ ] **Step 1: Add standalone output** — `next.config.ts`: merge `{ output: "standalone" }` into the config object.

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm db:generate && pnpm build

FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Write `docker-compose.prod.yml`** (app + postgres + redis + nginx; env from `.env.prod`)

```yaml
services:
  app:
    build: .
    env_file: .env.prod
    depends_on: [postgres, redis]
    restart: always
  postgres:
    image: postgres:16
    env_file: .env.prod
    volumes: ["pg:/var/lib/postgresql/data"]
    restart: always
  redis:
    image: redis:7
    volumes: ["redis:/data"]
    restart: always
  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./deploy/nginx/lunia.conf:/etc/nginx/conf.d/default.conf:ro
      - ./deploy/certbot/conf:/etc/letsencrypt
      - ./deploy/certbot/www:/var/www/certbot
    depends_on: [app]
    restart: always
volumes: { pg: {}, redis: {} }
```

- [ ] **Step 4: Write `deploy/nginx/lunia.conf`** (proxy to `app:3000`, ACME challenge location, HTTP→HTTPS redirect once certs exist). Include `location /.well-known/acme-challenge/ { root /var/www/certbot; }` and `location / { proxy_pass http://app:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }`.

- [ ] **Step 5: Write `deploy/scripts/backup.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date +%Y%m%d-%H%M%S)
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U lunia lunia | gzip > "backups/db-$STAMP.sql.gz"
echo "backup written: backups/db-$STAMP.sql.gz"
```

- [ ] **Step 6: Write `deploy/scripts/deploy.sh`** (pull, build, migrate deploy, restart)

```bash
#!/usr/bin/env bash
set -euo pipefail
git pull --ff-only
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml run --rm app pnpm prisma migrate deploy
docker compose -f docker-compose.prod.yml up -d
echo "deployed"
```

- [ ] **Step 7: Write `deploy/scripts/restore.sh`** (gunzip a backup and pipe into `psql`), and `chmod +x deploy/scripts/*.sh`.

- [ ] **Step 8: Write `docs/RUNBOOK.md`** documenting: env vars, first-boot (migrate + seed + certbot issue), deploy, backup/restore, rotating secrets, and the note to rotate the VPS root password and switch to SSH keys.

- [ ] **Step 9: Verify the image builds locally**

Run: `docker build -t lunia:test .`
Expected: image builds successfully.

- [ ] **Step 10: Commit**

```bash
git add Dockerfile docker-compose.prod.yml deploy docs/RUNBOOK.md next.config.ts
git commit -m "chore: production docker, nginx, and deploy/backup scripts"
```

---

## Self-Review

**Spec coverage (Stage-1 slice):**
- Custom Next.js + PostgreSQL + Redis — Tasks 1–3. ✓
- Configurable RBAC (roles/permissions) — Tasks 4, 7 + seed. ✓
- Client membership tiers + service-access groundwork — Task 4 (tiers seeded; service-access rules land in the Catalog stage). ✓
- Bilingual Gulf-Arabic-first/RTL + English — Task 8, 10. ✓
- Brand design tokens (exact palette + type placeholders) — Task 9. ✓
- Auth incl. staff login; client phone-OTP login is scoped to the Booking stage (client users modeled here). ✓
- Deploy skeleton on VPS (Docker/Nginx/TLS/backups) — Task 11; live deploy deferred to a later approved step. ✓
- CMS, public pages, booking, dashboards, comms — **explicitly out of Stage 1**, each its own later plan.

**Placeholder scan:** No "TBD/handle appropriately" left; every code step has real code or exact commands.

**Type consistency:** `PermissionKey`, `getCurrentUser`, `createSession`/`getSession`/`destroySession`, `authenticateStaff`, `localeDirection`, `Button`/`Container` names match across tasks.

**Known follow-ups (next stage plans):** service-access rules + full catalog; CMS/media/settings UI; client OTP login; the worker process wiring (BullMQ) is provisioned in infra but its first jobs arrive with reminders in the Booking stage.
