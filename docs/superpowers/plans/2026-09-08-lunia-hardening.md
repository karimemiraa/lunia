# Lunia Stage 7 — Hardening & Deploy Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Lunia platform for production (security, reliability, PDPL-aware privacy, ops) and make it deploy-ready on the Namecheap VPS — the actual `git`/SSH deploy is a separate, human-gated step outside this plan.

**Architecture:** Additive hardening over the merged Stages 1–6. Redis-backed rate-limit/lockout for staff login (mirrors the existing OTP cap pattern in `clientAuth.ts`); constant-time auth to remove user-enumeration timing; a small `AuditLog` model + `recordAudit` helper wired into sensitive admin mutations; baseline security headers via Next middleware (alongside the existing i18n middleware); an atomic PENDING→SENDING claim so the worker is safe to run at >1 replica; OTP-code redaction in `CommunicationLog.body`; a real `app` healthcheck gating nginx; and backup/restore scripts + runbook drill.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Prisma 7.10.0 (driver adapter), PostgreSQL 16, Redis 7 (ioredis), Vitest 5 (serial, `fileParallelism:false`), Playwright (workers:1), Docker Compose, Nginx, Certbot.

**Spec:** `docs/superpowers/specs/2026-09-07-lunia-platform-design.md` (§9 Non-functional, §10 Deployment)

## Global Constraints

- NEVER use emojis in any user-facing copy or code. NEVER use generic premium-website templates.
- Public site: Gulf-Arabic default + RTL, English secondary. Internal system: English default + Gulf Arabic.
- Secrets live in env only — never committed, never logged, never rendered. No real message sends in dev/test (stubSender unless `NODE_ENV=production` AND provider configured).
- Money in integer minor units. Center timezone fixed Asia/Riyadh (UTC+3) via `centerLocalToUtc`/`utcToCenterLocal`.
- Prisma 7 uses the driver adapter; schema has no `datasource.url`; migrations run via the `migrator` image target.
- Tests: unit via Vitest (serial), jsdom via `// @vitest-environment jsdom` docblock; DB-backed unit tests need the local Postgres+Redis (docker compose) up. e2e via Playwright (serial). Keep the whole suite green (tsc, unit, build, e2e).
- RBAC is server-side and guard-first: every admin page and server action calls `requireAdmin(PERMISSION)` before any work.
- No payment credentials handled by the build.

---

### Task 1: Harden `getSession` against corrupt Redis values

A corrupt/non-JSON session value currently throws out of `getSession`, turning a bad cookie into a 500 on every guarded request. Parse defensively: on any parse failure or shape mismatch, delete the bad key and return `null` (treated as logged-out).

**Files:**
- Modify: `src/modules/iam/session.ts`
- Test: `tests/iam/session.test.ts` (create)

**Interfaces:**
- Consumes: `getRedis()` from `@/lib/redis`.
- Produces: `getSession(token: string): Promise<{ userId: string } | null>` (unchanged signature; now never throws on bad data).

- [ ] **Step 1: Write the failing test**

```ts
// tests/iam/session.test.ts
import { describe, it, expect } from "vitest";
import { getRedis } from "@/lib/redis";
import { createSession, getSession, destroySession } from "@/modules/iam/session";

describe("getSession hardening", () => {
  it("round-trips a valid session", async () => {
    const token = await createSession("user-1");
    expect(await getSession(token)).toEqual({ userId: "user-1" });
    await destroySession(token);
  });

  it("returns null and deletes the key for a non-JSON value", async () => {
    const token = "corrupt-token-nonjson";
    await getRedis().set(`session:${token}`, "not-json{", "EX", 60);
    expect(await getSession(token)).toBeNull();
    expect(await getRedis().get(`session:${token}`)).toBeNull();
  });

  it("returns null for a JSON value missing userId", async () => {
    const token = "corrupt-token-shape";
    await getRedis().set(`session:${token}`, JSON.stringify({ nope: 1 }), "EX", 60);
    expect(await getSession(token)).toBeNull();
    await destroySession(token);
  });

  it("returns null for an absent token", async () => {
    expect(await getSession("does-not-exist")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm the corrupt-value cases fail**

Run: `npx vitest run tests/iam/session.test.ts`
Expected: the non-JSON case FAILS (throws) with the current implementation.

- [ ] **Step 3: Implement defensive parsing**

```ts
// src/modules/iam/session.ts — replace getSession
export async function getSession(token: string): Promise<{ userId: string } | null> {
  const raw = await getRedis().get(keyFor(token));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && typeof (parsed as { userId?: unknown }).userId === "string") {
      return { userId: (parsed as { userId: string }).userId };
    }
  } catch {
    // fall through to cleanup
  }
  // Corrupt or malformed value: drop it so it stops causing errors, treat as logged-out.
  await getRedis().del(keyFor(token));
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/iam/session.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/iam/session.ts tests/iam/session.test.ts
git commit -m "fix(iam): harden getSession against corrupt Redis session values"
```

---

### Task 2: Staff-login rate-limit, lockout, and constant-time auth

Add Redis-backed throttling and lockout to staff login, and make `authenticateStaff` constant-time for absent/inactive users (dummy bcrypt verify) so attackers cannot enumerate accounts by timing. Wire the throttle into the login server action, keyed by both email and client IP.

**Files:**
- Modify: `src/modules/iam/auth.ts`
- Create: `src/modules/iam/loginThrottle.ts`
- Modify: the staff login server action (locate via `grep -rn "authenticateStaff" src/app`) — call the throttle before verifying, and record success/failure after.
- Test: `tests/iam/loginThrottle.test.ts` (create), `tests/iam/auth.test.ts` (create or extend)

**Interfaces:**
- Consumes: `getRedis()`, `verifyPassword`, `prisma`.
- Produces:
  - `authenticateStaff(email, password): Promise<{ id: string } | null>` — unchanged signature; now always runs a bcrypt verify (real hash or a fixed dummy hash) so timing does not reveal whether the account exists.
  - `loginThrottle.ts`:
    - `checkLoginAllowed(key: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }>`
    - `recordLoginFailure(key: string): Promise<void>`
    - `recordLoginSuccess(key: string): Promise<void>` (clears counters)
    - Constants: `MAX_ATTEMPTS = 5`, `WINDOW_SECONDS = 15 * 60`, `LOCKOUT_SECONDS = 15 * 60`.

- [ ] **Step 1: Write the failing throttle test**

```ts
// tests/iam/loginThrottle.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { getRedis } from "@/lib/redis";
import {
  checkLoginAllowed, recordLoginFailure, recordLoginSuccess, MAX_ATTEMPTS,
} from "@/modules/iam/loginThrottle";

const KEY = `test:${Date.now()}:user@example.com`;

beforeEach(async () => {
  await getRedis().del(`loginfail:${KEY}`, `loginlock:${KEY}`);
});

describe("login throttle", () => {
  it("allows initially and after a success clears failures", async () => {
    expect((await checkLoginAllowed(KEY)).allowed).toBe(true);
    await recordLoginFailure(KEY);
    await recordLoginSuccess(KEY);
    expect((await checkLoginAllowed(KEY)).allowed).toBe(true);
  });

  it("locks out after MAX_ATTEMPTS failures", async () => {
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) await recordLoginFailure(KEY);
    const res = await checkLoginAllowed(KEY);
    expect(res.allowed).toBe(false);
    expect(res.retryAfterSeconds).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/iam/loginThrottle.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the throttle**

```ts
// src/modules/iam/loginThrottle.ts
import { getRedis } from "@/lib/redis";

export const MAX_ATTEMPTS = 5;
export const WINDOW_SECONDS = 15 * 60;
export const LOCKOUT_SECONDS = 15 * 60;

const failKey = (key: string) => `loginfail:${key}`;
const lockKey = (key: string) => `loginlock:${key}`;

export async function checkLoginAllowed(key: string): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const ttl = await getRedis().ttl(lockKey(key));
  if (ttl > 0) return { allowed: false, retryAfterSeconds: ttl };
  return { allowed: true };
}

export async function recordLoginFailure(key: string): Promise<void> {
  const redis = getRedis();
  const count = await redis.incr(failKey(key));
  if (count === 1) await redis.expire(failKey(key), WINDOW_SECONDS);
  if (count >= MAX_ATTEMPTS) {
    await redis.set(lockKey(key), "1", "EX", LOCKOUT_SECONDS);
    await redis.del(failKey(key));
  }
}

export async function recordLoginSuccess(key: string): Promise<void> {
  await getRedis().del(failKey(key), lockKey(key));
}
```

- [ ] **Step 4: Write the failing auth constant-time test**

```ts
// tests/iam/auth.test.ts
import { describe, it, expect } from "vitest";
import { authenticateStaff } from "@/modules/iam/auth";

describe("authenticateStaff", () => {
  it("returns null for an unknown email without throwing", async () => {
    expect(await authenticateStaff("nobody@nowhere.test", "whatever")).toBeNull();
  });
  it("runs a verify even for an absent user (no early return before hashing)", async () => {
    // Two unknown-user calls should be within the same order of magnitude as
    // a wrong-password call for a real user; we assert only that it resolves
    // to null and does not throw. (Timing is validated by construction: the
    // dummy-hash path always runs verifyPassword.)
    const a = await authenticateStaff("unknown-a@nowhere.test", "x");
    const b = await authenticateStaff("unknown-b@nowhere.test", "y");
    expect(a).toBeNull();
    expect(b).toBeNull();
  });
});
```

- [ ] **Step 5: Implement constant-time auth**

```ts
// src/modules/iam/auth.ts
import { prisma } from "@/lib/db";
import { verifyPassword } from "./password";

// A fixed bcrypt hash of a random string. When the user is absent/inactive we
// still run verifyPassword against this so the response time does not reveal
// whether the account exists (user-enumeration timing). The value is public;
// it corresponds to no real password.
const DUMMY_HASH = "$2b$10$C6UzMDM.H6dfI/f/IKcEeOD/LhY6.7q0aVv1sZ2A9F3nq0Jr9m1Ky";

export async function authenticateStaff(email: string, password: string): Promise<{ id: string } | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  const hash = user && user.isActive && user.passwordHash && user.type === "STAFF" ? user.passwordHash : DUMMY_HASH;
  const ok = await verifyPassword(password, hash);
  if (ok && user && user.isActive && user.passwordHash && user.type === "STAFF") return { id: user.id };
  return null;
}
```

> NOTE for implementer: regenerate `DUMMY_HASH` with the project's bcrypt (`verifyPassword`/`hashPassword` in `src/modules/iam/password.ts`) so the cost factor matches real hashes; a mismatched cost defeats the timing goal. Do not hardcode a real password's hash.

- [ ] **Step 6: Wire the throttle into the login server action**

Locate the action (`grep -rn "authenticateStaff" src/app`). Before authenticating: build `key = ${email}` (lowercased) and, if a request IP is available, also gate on IP; call `checkLoginAllowed(key)`; if not allowed, return a generic "too many attempts, try again later" error (do NOT reveal whether the email exists). After `authenticateStaff`: on null → `recordLoginFailure(key)` and return the existing generic invalid-credentials error; on success → `recordLoginSuccess(key)` then create the session as today. Keep the user-facing error copy identical for "wrong password" and "no such user".

- [ ] **Step 7: Run all new/affected tests + tsc**

Run: `npx vitest run tests/iam/ && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/modules/iam/auth.ts src/modules/iam/loginThrottle.ts src/app tests/iam/loginThrottle.test.ts tests/iam/auth.test.ts
git commit -m "feat(iam): staff-login rate-limit/lockout + constant-time auth (anti-enumeration)"
```

---

### Task 3: Redact the OTP code in `CommunicationLog.body`

The OTP audit row currently stores the full SMS body including the plaintext code (PDPL/security concern). Send the real code to the user, but store a redacted body in the log. Apply the same redaction anywhere an OTP body is persisted.

**Files:**
- Modify: `src/modules/iam/clientAuth.ts` (`sendOtpSms`)
- Create: `src/modules/comms/redact.ts` (small pure helper)
- Test: `tests/comms/redact.test.ts` (create); extend `tests/iam/clientAuth.test.ts` if it asserts on the logged body.

**Interfaces:**
- Produces: `redactOtpBody(body: string, code: string): string` — replaces every occurrence of `code` in `body` with a mask of the same length (e.g. `••••`), returning a body safe to store.

- [ ] **Step 1: Write the failing redaction test**

```ts
// tests/comms/redact.test.ts
import { describe, it, expect } from "vitest";
import { redactOtpBody } from "@/modules/comms/redact";

describe("redactOtpBody", () => {
  it("masks the code wherever it appears", () => {
    const out = redactOtpBody("Your Lunia code is 482913. Valid 5 min.", "482913");
    expect(out).not.toContain("482913");
    expect(out).toContain("Lunia");
  });
  it("is a no-op when the code is empty", () => {
    expect(redactOtpBody("hello", "")).toBe("hello");
  });
});
```

- [ ] **Step 2: Run to verify it fails.** `npx vitest run tests/comms/redact.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// src/modules/comms/redact.ts
// Replaces every literal occurrence of `code` in `body` with a same-length
// mask so an OTP/secret is never persisted to CommunicationLog.body.
export function redactOtpBody(body: string, code: string): string {
  if (!code) return body;
  const mask = "•".repeat(code.length);
  return body.split(code).join(mask);
}
```

- [ ] **Step 4: Use it in `sendOtpSms`.** When creating the `CommunicationLog` row, store `redactOtpBody(body, code)` instead of `body`. The `sender.send({ body })` call still receives the real `body` (the user must get the real code).

- [ ] **Step 5: Run affected tests + tsc.** `npx vitest run tests/comms/ tests/iam/clientAuth.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 6: Commit**

```bash
git add src/modules/comms/redact.ts src/modules/iam/clientAuth.ts tests/comms/redact.test.ts
git commit -m "feat(comms): redact OTP code in CommunicationLog.body (PDPL)"
```

---

### Task 4: Atomic PENDING→SENDING claim in the outbox (multi-replica safety)

`processDueMessages` reads PENDING rows then updates them after sending. Two worker replicas could both read the same row and double-send. Add an atomic claim: flip a batch of due PENDING rows to `SENDING` (stamping a claim id) in one `updateMany`, then process only the rows this call claimed. On send outcome, flip SENDING→SENT/FAILED. A crashed claim leaves rows in SENDING; add a `reclaimStale(now)` that returns SENDING rows older than a threshold to PENDING.

**Files:**
- Modify: `prisma/schema.prisma` (add `SENDING` to the ScheduledMessage status enum if it is an enum; add `claimId String?` and `claimedAt DateTime?`), then create a migration.
- Modify: `src/modules/booking/outbox.ts` (`processDueMessages`, add `reclaimStaleClaims`).
- Modify: `worker/index.ts` (call `reclaimStaleClaims` at the top of each tick).
- Test: `tests/booking/outbox.test.ts` (extend).

**Interfaces:**
- Produces:
  - `processDueMessages(now, sender?)` — unchanged return shape; internally claims atomically.
  - `reclaimStaleClaims(now: Date, olderThanMs?: number): Promise<number>` — returns count reclaimed.

- [ ] **Step 1: Inspect the status field.** `grep -n "status" prisma/schema.prisma` around `model ScheduledMessage`. If status is a String, `SENDING` needs no enum change; if it is an enum, add the value. Record which in the report.

- [ ] **Step 2: Write the failing concurrency test**

```ts
// add to tests/booking/outbox.test.ts
it("does not double-send when two processDueMessages run against the same due row", async () => {
  const now = new Date();
  const phone = freshPhone();
  await scheduleMessage({ kind: "CONFIRMATION", toPhone: phone, locale: "en", sendAt: new Date(now.getTime() - 1000), payload: {} });
  let sends = 0;
  const counting: CommsSender = { send: async () => { sends += 1; return { ok: true, providerRef: "r" }; } };
  const [a, b] = await Promise.all([processDueMessages(now, counting), processDueMessages(now, counting)]);
  expect(sends).toBe(1);
  expect(a.sent + b.sent).toBe(1);
  const logs = await prisma.communicationLog.findMany({ where: { toPhone: phone } });
  expect(logs.length).toBe(1);
});

it("reclaimStaleClaims returns an abandoned SENDING row to PENDING", async () => {
  const now = new Date();
  const phone = freshPhone();
  const m = await scheduleMessage({ kind: "CONFIRMATION", toPhone: phone, locale: "en", sendAt: new Date(now.getTime() - 1000), payload: {} });
  await prisma.scheduledMessage.update({ where: { id: m.id }, data: { status: "SENDING", claimedAt: new Date(now.getTime() - 10 * 60_000) } });
  const reclaimed = await reclaimStaleClaims(now, 5 * 60_000);
  expect(reclaimed).toBeGreaterThanOrEqual(1);
  const after = await prisma.scheduledMessage.findUniqueOrThrow({ where: { id: m.id } });
  expect(after.status).toBe("PENDING");
});
```

- [ ] **Step 3: Implement the atomic claim.** In `processDueMessages`: generate `const claimId = randomUUID()`; run `updateMany({ where: { status: "PENDING", sendAt: { lte: now } }, data: { status: "SENDING", claimId, claimedAt: now } })` — but `updateMany` cannot LIMIT in Prisma/Postgres directly, so claim by first selecting up to `DEFAULT_BATCH_SIZE` ids (`findMany … select:{id}`) then `updateMany({ where: { id: { in: ids }, status: "PENDING" }, data: {...} })`, and finally `findMany({ where: { claimId } })` to get exactly the rows this call won. Process those; flip each to SENT/FAILED as today (the terminal transaction should filter `where: { id, status: "SENDING" }`). Keep render inside the per-message try (Stage 6 M1).

- [ ] **Step 4: Add `reclaimStaleClaims`** — `updateMany({ where: { status: "SENDING", claimedAt: { lt: new Date(now - olderThanMs) } }, data: { status: "PENDING", claimId: null, claimedAt: null } })`, default `olderThanMs = 5*60_000`.

- [ ] **Step 5: Wire the worker** — call `await reclaimStaleClaims(new Date())` at the start of each `tick()` before `processDueMessages`.

- [ ] **Step 6: Migrate + run tests**

Run: `pnpm prisma migrate dev --name outbox-atomic-claim` then `npx vitest run tests/booking/outbox.test.ts && npx tsc --noEmit`
Expected: PASS (including idempotency and the two new tests).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/modules/booking/outbox.ts worker/index.ts tests/booking/outbox.test.ts
git commit -m "feat(outbox): atomic PENDING->SENDING claim + stale-claim reclaim (multi-replica safe)"
```

---

### Task 5: Audit log for sensitive admin actions

Spec §9 requires an audit log for sensitive admin actions. Add an `AuditLog` model, a `recordAudit` helper, and wire it into the highest-sensitivity mutations: role/permission changes, tier changes, user create/deactivate, and site-settings writes. Add a read-only admin viewer.

**Files:**
- Modify: `prisma/schema.prisma` (add `AuditLog`), migration.
- Create: `src/modules/iam/audit.ts`.
- Modify: the sensitive server actions (roles, tiers, users, settings) to call `recordAudit`.
- Create: `src/app/admin/audit/page.tsx` (guard `requireAdmin(PERMISSIONS.ROLE_MANAGE)` or a new `AUDIT_VIEW` permission — reuse an existing high-privilege permission to avoid a seed/permission migration; record which in the report).
- Test: `tests/iam/audit.test.ts` (create).

**Interfaces:**
- `AuditLog { id, actorUserId String (soft ref), action String, entityType String, entityId String?, summary String, createdAt DateTime @default(now()) }` with an index on `createdAt`.
- `recordAudit(input: { actorUserId: string; action: string; entityType: string; entityId?: string; summary: string }): Promise<void>` — never throws (wrap in try/catch + console.error); auditing must not break the underlying mutation.

- [ ] **Step 1: Write the failing test**

```ts
// tests/iam/audit.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/modules/iam/audit";

const ACTOR = `audit-test-actor-${Date.now()}`;
afterEach(async () => { await prisma.auditLog.deleteMany({ where: { actorUserId: ACTOR } }); });

describe("recordAudit", () => {
  it("writes an audit row", async () => {
    await recordAudit({ actorUserId: ACTOR, action: "ROLE_UPDATE", entityType: "Role", entityId: "r1", summary: "changed perms" });
    const rows = await prisma.auditLog.findMany({ where: { actorUserId: ACTOR } });
    expect(rows.length).toBe(1);
    expect(rows[0]!.action).toBe("ROLE_UPDATE");
  });
  it("does not throw on a bad payload (auditing never breaks the mutation)", async () => {
    // @ts-expect-error deliberately wrong
    await expect(recordAudit({ actorUserId: ACTOR })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Add the model + migrate.** Add `AuditLog` to the schema; `pnpm prisma migrate dev --name audit-log`.

- [ ] **Step 3: Implement `recordAudit`** (try/catch, never throws).

- [ ] **Step 4: Wire into sensitive actions.** In each of: role permission changes, tier create/update, user create/deactivate, and settings writes — after the mutation succeeds, call `recordAudit` with the acting user's id (from the current session/`getCurrentUser`), a stable `action` string, and a short human summary. Keep summaries free of secrets.

- [ ] **Step 5: Admin viewer.** `src/app/admin/audit/page.tsx` — guard-first; render the latest N audit rows via `<DataTable>` (actor, action, entity, summary, timestamp) with a simple search/filter, matching the existing admin page pattern. Add a nav entry gated on the same permission.

- [ ] **Step 6: Run tests + build**

Run: `npx vitest run tests/iam/audit.test.ts && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/modules/iam/audit.ts src/app/admin src/components/admin tests/iam/audit.test.ts
git commit -m "feat(iam): audit log for sensitive admin actions + viewer"
```

---

### Task 6: Baseline security headers via middleware

No security response headers are set today. Add them in the existing middleware (i18n) without breaking localized routing or the media route's own CSP. HSTS only in production.

**Files:**
- Modify: `src/middleware.ts` (wrap/extend the next-intl middleware response with headers).
- Test: `e2e/security-headers.spec.ts` (create) — assert headers on a public page and an admin redirect.

**Interfaces:**
- Consumes: existing middleware chain. Produces: same routing behavior + added headers.

Headers to set on HTML responses:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains` — only when `process.env.NODE_ENV === "production"`.
- A conservative `Content-Security-Policy` that allows self, inline styles (Next injects some), data: images, and the self origin for scripts. Do NOT overwrite the `/api/media/[...path]` route's stricter per-response CSP — scope the middleware CSP to page routes (skip `/api/`).

- [ ] **Step 1: Write the failing e2e**

```ts
// e2e/security-headers.spec.ts
import { test, expect } from "@playwright/test";
test("public page carries baseline security headers", async ({ request }) => {
  const res = await request.get("/en");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["referrer-policy"]).toBeTruthy();
});
```

- [ ] **Step 2: Run to confirm fail.** `npx playwright test e2e/security-headers.spec.ts` → FAIL.

- [ ] **Step 3: Implement in middleware.** Call the next-intl middleware to get its `response`, then set the headers above on it (skip when the pathname starts with `/api/`), and return it. Verify the matcher already excludes static assets; keep it.

- [ ] **Step 4: Run e2e + full build + a smoke of localized routing**

Run: `npm run build && npx playwright test e2e/security-headers.spec.ts e2e/smoke.spec.ts e2e/site-seo.spec.ts`
Expected: PASS (headers present, RTL/redirect/hreflang still green).

- [ ] **Step 5: Commit**

```bash
git add src/middleware.ts e2e/security-headers.spec.ts
git commit -m "feat(security): baseline security headers via middleware (HSTS in prod)"
```

---

### Task 7: Production healthcheck + backup/restore ops

Give the `app` service a real healthcheck and gate nginx on it; add nightly backup and restore scripts and document the restore drill.

**Files:**
- Modify: `docker-compose.prod.yml` (add `app.healthcheck` hitting `/api/health`; make `nginx.depends_on.app.condition: service_healthy`).
- Create: `scripts/backup.sh` (pg_dump + media tar, timestamped, prune old), `scripts/restore.sh` (restore from a named dump, with a confirmation prompt).
- Modify: `docs/RUNBOOK.md` (add a "Backups & restore drill" section; document the healthcheck).
- Test: none automated for shell scripts; validate with `bash -n` (syntax) and a documented manual drill. Add a note in the report describing the manual verification performed.

- [ ] **Step 1: Add the app healthcheck.** In `docker-compose.prod.yml` `app`:

```yaml
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O /dev/null http://localhost:3000/api/health || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 5
      start_period: 30s
```

Then set nginx `depends_on: { app: { condition: service_healthy } }`. (If the `run` image lacks wget, use a Node one-liner or `curl`; verify against the Dockerfile base and record which in the report.)

- [ ] **Step 2: Write `scripts/backup.sh`** — `pg_dump` of the app DB to `backups/db-<UTC timestamp>.sql.gz`, tar of the media dir to `backups/media-<ts>.tgz`, prune backups older than 14 days. Read connection details from env. `set -euo pipefail`.

- [ ] **Step 3: Write `scripts/restore.sh`** — takes a dump path argument, prints the target DB and requires the operator to type `restore` to proceed, then restores. `set -euo pipefail`.

- [ ] **Step 4: Syntax-check + document**

Run: `bash -n scripts/backup.sh && bash -n scripts/restore.sh`
Expected: no output (valid). Update RUNBOOK with the nightly cron example and the restore-drill steps.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.prod.yml scripts/backup.sh scripts/restore.sh docs/RUNBOOK.md
git commit -m "feat(ops): app healthcheck gating nginx + backup/restore scripts + runbook drill"
```

---

### Task 8: Config-driven booking channel (resolve Stage 6 M2)

`channelForProvider` hardwires `twilio → whatsapp`, so a Twilio-SMS-only client's booking messages would target the wrong channel. Make the booking-message channel configurable, defaulting to today's behavior.

**Files:**
- Modify: `src/modules/comms/config.ts` (add an optional channel preference to the resolved config — read from an env var, e.g. `COMMS_BOOKING_CHANNEL` ∈ {`whatsapp`,`sms`}, default derived as today).
- Modify: `src/modules/booking/outbox.ts` (`channelForProvider` → honor the configured channel when set; keep the current provider-derived default otherwise).
- Test: `tests/comms/config.test.ts` and/or `tests/booking/outbox.test.ts` (extend).

**Interfaces:**
- `getCommsConfig()` result gains `bookingChannel?: "whatsapp" | "sms"`.
- `channelForProvider` becomes `resolveChannel(config)`: if `config.bookingChannel` is set, use it; else the existing switch (unifonic→sms, meta/twilio/none→whatsapp).

- [ ] **Step 1: Write the failing test** asserting: with `bookingChannel: "sms"` and provider `twilio`, the resolved channel is `sms`; with it unset, twilio still resolves `whatsapp`; unifonic still `sms`.

- [ ] **Step 2: Run to confirm fail.**

- [ ] **Step 3: Implement** the config field (env-read, validated) and the resolver; update the single call site in `processDueMessages`.

- [ ] **Step 4: Run tests + tsc.** `npx vitest run tests/comms/ tests/booking/outbox.test.ts && npx tsc --noEmit` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/modules/comms/config.ts src/modules/booking/outbox.ts tests/comms/config.test.ts tests/booking/outbox.test.ts
git commit -m "feat(comms): config-driven booking channel (resolve M2 twilio SMS/WhatsApp)"
```

---

## Deploy (human-gated — NOT executed as part of this plan)

The actual VPS deploy is performed only after: (1) the client rotates the root password shared in chat, (2) the client provides domain/DNS, and (3) the user explicitly approves deployment in chat. Deploy steps live in `docs/RUNBOOK.md`. Before deploy, verify VPS inventory over SSH per spec §10. This plan stops at deploy-readiness; do not SSH to or deploy on the VPS autonomously.

---

## Self-Review

- **Spec coverage:** §9 Security (rate-limit T2, server-side RBAC already present, input validation present via Zod, secrets-in-env preserved, session hardening T1, audit log T5) ✓; §9 Privacy/PDPL (OTP redaction T3) ✓; §9 Reliability (healthcheck + backups/restore T7) ✓; §9 Ops (scripts + runbook T7) ✓; §10 Deployment (healthcheck gating, backup offsite documented; actual deploy gated) ✓. Accessibility/Core-Web-Vitals: spot-checked in prior stages (fonts self-hosted, semantic components, charts have sr-only tables); a dedicated a11y/perf audit pass is recommended but not code-generating — noted as a manual go-live checklist item in RUNBOOK rather than a task here.
- **Placeholder scan:** none — every code step carries real code or a precise, bounded instruction with named files/symbols.
- **Type consistency:** `reclaimStaleClaims`, `recordAudit`, `checkLoginAllowed/recordLoginFailure/recordLoginSuccess`, `redactOtpBody`, `resolveChannel` signatures are defined where produced and consumed consistently.
