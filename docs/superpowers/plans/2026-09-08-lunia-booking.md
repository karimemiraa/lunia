# Lunia Booking & Operations — Implementation Plan (Stage 4 of 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** The integrated custom booking engine and operations layer — clients book a service at a real available time (auto-creating a client profile), staff see and manage the day's appointments on a calendar, front-desk can book walk-ins and check clients in, clients log in via phone-OTP to see/rebook, and reminders are scheduled automatically. Payment stays "off" (request-to-book) and real reminder sends stay stubbed (Stage 6 wires WhatsApp/SMS).

**Architecture:** Extend the catalog for bookable attributes (duration/price/online-bookable + tier access rules) and add Rooms, StaffSchedules, Booking/Appointment, CheckIn, and a ScheduledMessage outbox. A pure availability engine computes open slots from business hours + staff schedules + room capacity + existing appointments. A booking service enforces the rules and lifecycle. Client phone-OTP auth reuses the Redis-session pattern for CLIENT users. A polling worker process delivers due ScheduledMessages via a comms interface (Stage-4 stub = log + CommunicationLog row).

**Tech Stack:** Existing repo stack (Next 16 App Router, Prisma 7 adapter via `@/lib/db`, next-intl, Tailwind v4 brand tokens, Redis sessions, Vitest + Playwright). Reuse: `requireAdmin`/`AdminShell`/`LocalizedField`/`DataTable`, `PERMISSIONS` (BOOKING_VIEW/BOOKING_MANAGE/CLIENT_VIEW/CLIENT_MANAGE + STAFF_MANAGE for schedules/rooms/service-settings, CATALOG_MANAGE for service booking settings), `createSession`/`getSession` pattern, catalog services, brand site components.

**Spec:** `docs/superpowers/specs/2026-09-07-lunia-platform-design.md` (§6 Booking & operations, §3 flexibility layer service-access rules).

## Global Constraints

- **Follow established repo patterns** — read before implementing: `src/lib/db.ts`, `src/modules/iam/{session,rbac,permissions}.ts`, `src/app/admin/_components/*`, `src/modules/catalog/*`, `src/app/[locale]/(site)/*` (site chrome/components + `getTranslations`), `src/modules/cms/settings.ts` (`getSetting("hours")`/`("business")`), `prisma/seed.ts` (Prisma-7 adapter + idempotent upsert).
- **Money** is stored as integer minor units (`priceMinor` in halalas/SAR*100); **durations** in minutes. Times stored UTC; the center operates in **Asia/Riyadh** (UTC+3, no DST) — do timezone math against a single `CENTER_TZ = "Asia/Riyadh"` constant/offset; render local time.
- **Availability & booking must never double-book** a staff member or a room: the create path re-checks the slot inside a transaction before committing.
- **Permissions:** every admin/staff mutation is `requireAdmin(<perm>)` guard-first. Public booking + client OTP endpoints are unauthenticated by design but validate input (Zod), rate-limit OTP requests (Redis counter), and never trust client-supplied prices/staff/tier.
- **Payments OFF:** booking status starts `REQUESTED`/`CONFIRMED` (see lifecycle); `depositStatus`/`paymentStatus` fields exist but default to `NONE`. No gateway calls.
- **Reminder sends are stubbed:** the comms interface logs + writes a `CommunicationLog` row; Stage 6 swaps in WhatsApp/SMS. Do NOT integrate any external messaging provider here.
- Bilingual (Gulf-Arabic-default/RTL public; English admin), brand tokens, logical properties, one h1/public page, a11y. TS strict (no unjustified `any`), no emojis, conventional commits, TDD (unit for engine/services/auth; e2e for flows). Prisma migrations committed; seed idempotent. Book CTAs repoint from `/[locale]/contact` to `/[locale]/book`.

---

## File Structure

```
prisma/schema.prisma          # + Service booking fields, Room, StaffSchedule, ServiceAccessRule, Booking, Appointment, CheckIn, ScheduledMessage; + UserType CLIENT already exists
prisma/seed.ts                # + durations/prices, rooms, staff schedules, access rules
src/modules/booking/
  availability.ts             # pure slot engine
  bookings.ts                 # create/list/reschedule/cancel/checkIn/complete/noShow + lifecycle
  rooms.ts staffSchedules.ts serviceSettings.ts accessRules.ts
  outbox.ts                   # scheduleMessage + processDueMessages + comms interface (stub)
src/modules/iam/clientAuth.ts # phone-OTP request/verify + client session helpers
src/app/[locale]/(site)/book/ # public booking flow (service → time → contact/OTP → confirm)
src/app/[locale]/(site)/account/ # client area (guarded by client session)
src/app/admin/calendar/       # staff day/week calendar + appointment actions
src/app/admin/booking/        # rooms, staff schedules, service booking settings, walk-in
worker/index.ts               # polling worker: processDueMessages loop
docker-compose.yml / .prod.yml# + worker service
```

---

## Task 1: Booking schema + seed

**Files:** `prisma/schema.prisma`, migration, `prisma/seed.ts`, `tests/booking/model.test.ts`.

- Extend `Service`: `durationMin Int @default(60)`, `priceMinor Int @default(0)`, `onlineBookable Boolean @default(true)`, `inCenterOnly Boolean @default(false)`.
- `Room` { id, name, capacity Int @default(1), isActive, order }.
- `StaffSchedule` { id, staffUserId (FK User), weekday Int (0-6), startMin Int, endMin Int, isActive } — working windows per weekday (minutes from midnight, center-local).
- `ServiceAccessRule` { id, serviceId (FK, unique), minTierId String? } — a service requiring at least a given membership tier (null = open to all).
- `Booking` { id, clientProfileId (FK ClientProfile), status (enum BookingStatus REQUESTED|CONFIRMED|CHECKED_IN|COMPLETED|CANCELLED|NO_SHOW), channel (enum BookingChannel ONLINE|FRONT_DESK|WALK_IN), sourceChannel String?, notes String?, depositStatus (enum PayStatus NONE|PENDING|PAID @default(NONE)), createdById String?, createdAt, updatedAt }.
- `Appointment` { id, bookingId (FK, cascade), serviceId (FK), staffUserId (FK User), roomId (FK Room), startAt DateTime, endAt DateTime, priceMinorSnapshot Int } — the reserved time block(s).
- `CheckIn` { id, bookingId @unique, arrivedAt, seatedAt? }.
- `ScheduledMessage` { id, bookingId?, kind (enum MsgKind CONFIRMATION|REMINDER_24H|POST_VISIT), toPhone String, locale String, sendAt DateTime, sentAt DateTime?, status (enum MsgStatus PENDING|SENT|FAILED @default(PENDING)), payload Json }.
- Seed (idempotent): set durationMin/priceMinor per seeded service (reasonable values), 2–3 Rooms, StaffSchedule rows for the seeded owner + add one seeded `specialist` staff user with a weekly schedule (Sun–Thu 10:00–20:00), and a couple of ServiceAccessRules (e.g. leave most open; gate one premium service to `vip`).

- [ ] Add models/enums; migrate `--name booking`; generate. Round-trip test (create a booking+appointment; enums). Seed idempotent (2x). Commit `feat(booking): schema + seed`.

## Task 2: Availability engine (pure)

**Files:** `src/modules/booking/availability.ts`, `tests/booking/availability.test.ts`.

- `computeSlots(input: { date: string; service: {durationMin}; staffSchedules: StaffSchedule[]; rooms: Room[]; existingAppointments: {staffUserId,roomId,startAt,endAt}[]; businessHours: DayHours; slotStepMin?: number }): { startAt: Date; endAt: Date; staffUserId: string; roomId: string }[]` — pure function. For the given date (center-local), intersect business hours (from settings `hours`) with each staff member's schedule for that weekday, step by `slotStepMin` (default 15), and for each candidate start where duration fits, find a free (staff, room) pair not overlapping existing appointments. Return distinct bookable start times (optionally with an assigned staff+room). Handle: closed days, no schedules, fully-booked → empty.
- Keep it deterministic and timezone-correct (Asia/Riyadh). Export helpers used by the booking service.

- [ ] TDD extensively: a day with one staff + one room yields the right slot count; an existing appointment removes overlapping slots; a closed day → no slots; duration that doesn't fit before close is excluded; two staff double the concurrency. Commit `feat(booking): availability engine`.

## Task 3: Booking service + lifecycle

**Files:** `src/modules/booking/bookings.ts`, `src/modules/booking/serviceSettings.ts`, `src/modules/booking/accessRules.ts`, `tests/booking/bookings.test.ts`.

- `getBookableServices(locale)` (onlineBookable + published), `getServiceSlots(serviceId, date)` (uses availability engine with live schedules/rooms/appointments + settings hours).
- `createBooking(input: { serviceId; startAt; staffUserId?; roomId?; client: {name; phone; email?}; channel; sourceChannel?; notes?; clientProfileId?; tierOverride? })`:
  - Resolve/validate the service (must be published; if channel ONLINE must be onlineBookable and not inCenterOnly).
  - Enforce ServiceAccessRule: if the service requires a min tier, the client's tier must meet it (front-desk/walk-in with a known client; online guests are the base `guest` tier → rejected with a clear message if gated).
  - Find-or-create the ClientProfile by phone (auto-create a CLIENT `User` + `ClientProfile`, capturing `sourceChannel`). 
  - In a transaction: re-check the chosen (staff, room, time) is still free (no overlapping Appointment), then create Booking (status CONFIRMED for now; payments off) + Appointment (price snapshot).
  - Schedule messages via outbox (CONFIRMATION now, REMINDER_24H at startAt-24h, POST_VISIT at endAt+2h) — Task 6.
  - Return the booking.
- `listBookings(filter: { date?; from?; to?; staffUserId?; status?; clientProfileId? })`, `getBooking(id)`.
- Lifecycle transitions (guard valid transitions): `confirmBooking`, `checkIn` (→ CHECKED_IN + CheckIn row), `complete` (→ COMPLETED), `cancel` (→ CANCELLED), `markNoShow` (→ NO_SHOW), `reschedule(bookingId, newStartAt, staffUserId?, roomId?)` (re-checks availability). Each validates the current status.

- [ ] TDD: create a booking auto-creates a client (by phone) and an appointment; double-booking the same staff/room/time is rejected; a tier-gated service rejects a guest online; lifecycle transitions valid/invalid; reschedule frees the old slot and takes a new one. Commit `feat(booking): booking service + lifecycle`.

## Task 4: Client phone-OTP auth

**Files:** `src/modules/iam/clientAuth.ts`, `tests/iam/clientAuth.test.ts`.

- `requestOtp(phone): Promise<{ devCode?: string }>` — generate a 6-digit code, store in Redis `otp:<phone>` with a short TTL (e.g. 5 min) + an attempt/rate counter (`otpreq:<phone>` limited, e.g. 5/hour); return the code ONLY in non-production (`devCode`) so dev/e2e can complete the flow (Stage 6 sends real SMS). 
- `verifyOtp(phone, code): Promise<{ userId: string } | null>` — check the code; on success find-or-create the CLIENT `User` (+ `ClientProfile`, name optional/placeholder), delete the OTP, and return the user id (caller creates a session cookie). Rate-limit verify attempts.
- `getClientSessionUser(token)` — reuse `getSession`; ensure the user is type CLIENT; expose a `requireClient()`-style guard for the account area.
- A distinct client session cookie name (`lunia_client_session`) so staff/admin and client sessions don't collide.

- [ ] TDD: requestOtp stores a code + returns devCode in test env; verifyOtp with the right code creates/returns a CLIENT user and clears the code; wrong code → null; expired/rate-limited → null/error. Commit `feat(iam): client phone-otp auth`.

## Task 5: Public booking flow

**Files:** `src/app/[locale]/(site)/book/{page.tsx,BookingWizard.tsx,actions.ts}`, repoint Book CTAs (SiteHeader/SiteFooter/CtaBand/Hero usages) to `/${locale}/book`, `messages`, `e2e/site-booking.spec.ts`.

- A booking wizard (client component driving server actions): (1) pick a service (getBookableServices, grouped by department, showing duration/price, tier-gate note); (2) pick a date → fetch slots (server action → getServiceSlots) → pick a time; (3) enter name + phone → request OTP → enter code (verifyOtp creates client + session) [or allow "book without account" that still creates the profile by phone but skips OTP — DECISION: require phone, OTP optional for guest confirm; to keep it simple and testable, do: name+phone+OTP verify → then createBooking with the verified client]; (4) confirm → createBooking (channel ONLINE, sourceChannel from `?src`/referrer) → success page with the booking details. Capture attribution (UTM `src`/referrer) into sourceChannel.
- generateMetadata (noindex the booking funnel steps is optional; the /book landing can be indexable). One h1. Bilingual.

- [ ] e2e: /en/book → pick a service → pick a date/time → enter phone → (use devCode from requestOtp) verify → confirm → success shows the booking; a booking row + client profile are created. Repoint check: the header Book Now links to /book. Both locales spot-check. Commit `feat(site): public booking flow`.

## Task 6: Reminder outbox + worker

**Files:** `src/modules/booking/outbox.ts`, `worker/index.ts`, modify `prisma/seed`/none, modify `docker-compose.yml` + `docker-compose.prod.yml` (+ worker service), `package.json` (worker script), `tests/booking/outbox.test.ts`.

- `outbox.ts`: `scheduleMessage({bookingId,kind,toPhone,locale,sendAt,payload})` (insert ScheduledMessage PENDING); `processDueMessages(now)` — fetch PENDING with sendAt<=now, "send" each via the comms interface, mark SENT (or FAILED), write a `CommunicationLog` row. The comms interface (`sendMessage`) is a STUB here: it logs and records — NO external provider (Stage 6 swaps it). Booking service (Task 3) calls scheduleMessage for CONFIRMATION/REMINDER_24H/POST_VISIT.
- `worker/index.ts`: a small long-running Node process that loops `processDueMessages(new Date())` every ~30–60s (with a clean shutdown). Add `pnpm worker` script (tsx). Add a `worker` service to docker-compose (dev optional) and docker-compose.prod.yml (build the app image, run the worker command) sharing the DB/Redis.

- [ ] TDD: scheduleMessage inserts PENDING; processDueMessages sends due ones (stub) → marks SENT + CommunicationLog row, leaves future ones PENDING. Commit `feat(booking): reminder outbox + worker`.

## Task 7: Client account area

**Files:** `src/app/[locale]/(site)/account/{page.tsx,actions.ts}`, `src/app/[locale]/(site)/account/login/*` (phone-OTP login), `messages`, `e2e/site-account.spec.ts`.

- `/account/login`: phone-OTP login (requestOtp → verifyOtp → set `lunia_client_session` cookie). `/account`: guarded by client session — show upcoming + past bookings (listBookings by clientProfileId), a rebook button (→ /book prefilled), basic profile (name), and logout. Cancel-my-booking (allowed if >24h before start).

- [ ] e2e: login via OTP (devCode) → /account shows the booking created earlier (or create one in the test) → cancel it → it moves to cancelled. Commit `feat(site): client account area`.

## Task 8: Staff calendar + appointment actions (admin)

**Files:** `src/app/admin/calendar/{page.tsx,actions.ts, DayView.tsx, ...}`, `messages/admin` (English), `e2e/admin-calendar.spec.ts`.

- Under BOOKING_VIEW: a day (and simple week) calendar showing appointments (time, client, service, staff, room, status), filterable by staff/date; per-specialist column view. Under BOOKING_MANAGE: actions — check-in, mark complete, cancel, mark no-show, reschedule (pick a new slot), and a front-desk "book on the spot" (walk-in) form (createBooking channel FRONT_DESK/WALK_IN, choosing an existing or new client by phone, a service, staff, room, time — bypasses onlineBookable, still avoids double-booking). Reuse requireAdmin + AdminShell; add a Calendar link to AdminNav gated BOOKING_VIEW.

- [ ] e2e: owner → /admin/calendar shows today; create a walk-in booking via the front-desk form → it appears; check it in → status CHECKED_IN; mark complete. Commit `feat(admin): staff calendar + appointment ops`.

## Task 9: Admin — rooms, staff schedules, service booking settings, access rules

**Files:** `src/app/admin/booking/{rooms,schedules,services}/*` + actions, `messages/admin`, `e2e/admin-booking-config.spec.ts`.

- Rooms CRUD (STAFF_MANAGE); StaffSchedule editor per staff member (weekday windows) (STAFF_MANAGE); Service booking settings (durationMin/priceMinor/onlineBookable/inCenterOnly + ServiceAccessRule minTier) editable on the existing catalog service editor OR a booking-settings surface (CATALOG_MANAGE). Add links to AdminNav (gated). Reuse admin form patterns.

- [ ] e2e: owner edits a room + a staff schedule + a service's duration/price → changes reflect (e.g. the service's slots change or the price shows in the booking wizard). Commit `feat(admin): rooms, schedules, service booking settings`.

## Task 10: Attribution + booking analytics groundwork + polish

**Files:** wire sourceChannel capture end-to-end (public flow `?src`/referrer → Booking.sourceChannel → ClientProfile.sourceChannel on first booking); add a minimal `bookings` count/read helper for the Stage-5 dashboards; audit; full e2e.

- Ensure new-vs-returning is derivable (ClientProfile.createdAt vs booking), sourceChannel captured, price snapshots present (for revenue). No dashboards yet (Stage 5) — just make the data correct and add read helpers `bookingStats({from,to})` returning counts/revenue by day/service/source (used by Stage 5).
- Repoint any remaining Book CTAs; ensure /book, /account, /admin/calendar, /admin/booking/* all load; one h1 per public page; a11y.

- [ ] Full `pnpm test` + `pnpm e2e` green; `pnpm build` clean. Commit `feat(booking): attribution capture + stats read helpers + polish`.

---

## Self-Review

- **Spec coverage (Stage-4):** book a service + pick date/time + confirmation ✓ (T5); auto-created client profiles ✓ (T3); staff see the day's appointments ✓ (T8); reminders scheduled automatically ✓ (T3,T6 — sends stubbed, Stage 6); in-center use (front-desk/walk-in + check-in) ✓ (T8); client login ✓ (T4,T7); service-access tiers ✓ (T1,T3,T9); source tracking ✓ (T3,T10). Payments deliberately off; real reminder sends deferred to Stage 6 (comms).
- **Deps:** T1→T2→T3→(T4,T6)→T5→T7→T8→T9→T10. T5 depends on T3/T4; T7 depends on T4; T8/T9 depend on T3.
- **Risks:** timezone correctness in the availability engine (test hard); transaction re-check to prevent double-booking; OTP dev-code exposure limited to non-production. The worker is a new process — keep it simple (poll loop), documented in the RUNBOOK (Stage 7 finalizes deploy).
- **Not in scope:** payment gateway; real WhatsApp/SMS; the CAC/LTV dashboards (Stage 5); memberships commerce.
