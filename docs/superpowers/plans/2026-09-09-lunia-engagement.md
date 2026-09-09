# Lunia Engagement Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a multi-channel comms foundation (email + switchable OTP + dual phone/email identity + notification preferences) and four engagement features (loyalty, gift cards & packages, waitlist & rebooking, reviews + AggregateRating SEO).

**Architecture:** Additive over the merged platform. Generalize the comms sender to carry email; add an SMTP EmailSender; route OTP/outbox by channel; consult per-client NotificationPreference. Each feature = schema + service (+ tests) + admin UI + public UI, built on the comms foundation. Hooks: loyalty/review-request/tier-upgrade on `complete()`; waitlist-notify on `cancel()`/`reschedule()`.

**Tech Stack:** Next.js 16, React 19, TS strict, Prisma 7 (driver adapter), Postgres 16, Redis 7, nodemailer (SMTP), Vitest 5 (serial), Playwright (workers:1), Tailwind v4 + the `.lunia-*` design system.

**Spec:** `docs/superpowers/specs/2026-09-09-lunia-engagement-design.md`

## Global Constraints

- No emojis; premium brand design via the `.lunia-*` utilities + brand tokens; bilingual RTL/LTR.
- No real sends in dev/test — email/SMS/WhatsApp all fall back to the logging stub unless `NODE_ENV=production` AND configured. OTP codes never persisted (redact).
- Money in integer minor units; Asia/Riyadh via center-local helpers; SERIALIZABLE tx for any balance/session/points spend.
- RBAC guard-first; Zod validate; audit sensitive admin mutations via `recordAudit`.
- Prisma 7 driver adapter; `pnpm prisma migrate dev --name <x>` then `pnpm prisma generate`; keep suite green (tsc/unit/build/e2e). Vitest serial; DB up via docker compose.
- Payments OFF: gift-card/package/loyalty redemption records intent + ledger, never a charge.

---

## Cluster A — Comms foundation

### Task A1: Email channel + generalized sender + SMTP provider + config

**Files:** modify `src/modules/booking/outbox.ts` (CommsSender/CommsMessage), `src/modules/comms/config.ts`, `src/modules/comms/sender.ts`, `src/modules/comms/templates.ts` (CHANNEL_VALUES + email); create `src/modules/comms/providers/email.ts`; modify `prisma/schema.prisma` (CommunicationLog.toEmail); `package.json` (nodemailer). Tests: `tests/comms/email.test.ts`, extend `tests/comms/config.test.ts`, `tests/comms/sender.test.ts`.

**Interfaces (produce):**
- `CommsMessage = { channel: string; toPhone?: string; toEmail?: string; subject?: string; body: string; kind: string; bookingId?: string }`; `CommsSender.send(msg: CommsMessage): Promise<{ok:boolean;providerRef?:string}>`. (Widen existing; SMS/WhatsApp adapters already read `toPhone`, unaffected.)
- `getCommsConfig().email?: { host:string; port:number; user:string; pass:string; from:string }` + `emailConfigured:boolean` (from `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/COMMS_EMAIL_FROM`; port parsed int, default 587).
- `makeEmailSender(cfg): CommsSender` (nodemailer `createTransport({host,port,secure:port===465,auth:{user,pass}})`, `sendMail({from,to:msg.toEmail,subject:msg.subject ?? "Lunia",text:msg.body})`, Abortable/try-catch → `{ok:false}`, never logs `pass`; `{ok:true, providerRef: info.messageId}` on success).
- `getEmailSender(env,nodeEnv): CommsSender` in sender.ts — stub unless prod + emailConfigured.
- `resolveSenderForChannel(channel, env?, nodeEnv?): CommsSender` — email→getEmailSender, sms→getSmsSender, else getConfiguredSender.
- `CHANNEL_VALUES = ["whatsapp","sms","email"]`.

**Steps:** add nodemailer dep (pin latest stable) + `@types/nodemailer` dev; TDD `makeEmailSender` with a mocked nodemailer transport (send success → messageId; throw → {ok:false}; never logs pass); add config parsing + tests; add `getEmailSender`/`resolveSenderForChannel` + tests; add `CommunicationLog.toEmail String?` + migration; widen CommsSender/CommsMessage + fix call sites; `tsc`/build green. Commit.

### Task A2: NotificationPreference model + service + outbox integration

**Files:** `prisma/schema.prisma` (NotificationPreference + enum), migration; create `src/modules/comms/preferences.ts`; modify `src/modules/booking/outbox.ts` (consult prefs). Tests: `tests/comms/preferences.test.ts`, extend `tests/booking/outbox.test.ts`.

**Model:** `enum CommsChannelPref { AUTO WHATSAPP SMS EMAIL }`. `NotificationPreference { id; clientProfileId String @unique; channel CommsChannelPref @default(AUTO); remindersOptIn Boolean @default(true); postVisitOptIn Boolean @default(true); marketingOptIn Boolean @default(true); updatedAt }` (relation to ClientProfile).

**Service:** `getPreference(clientProfileId)` (returns defaults if absent), `upsertPreference(clientProfileId, patch)`, `resolveDeliveryChannel({clientProfileId?, identifierKind, globalDefault})` → concrete channel. `scheduleMessage` gains optional `clientProfileId`; `processDueMessages` skips a message whose kind is opted out (`REMINDER_24H`→remindersOptIn, `POST_VISIT`→postVisitOptIn) and routes channel via preference when set (else existing provider-derived channel). Add a `ScheduledMessage.clientProfileId String?` column so the outbox can look up prefs. Keep Stage-6/7 guarantees (atomic claim, render-in-try).

**Steps:** schema+migrate+generate; TDD preferences service; wire outbox skip/route + tests (opted-out kind → message marked `SKIPPED` new status or simply `SENT` with a `skipped` note — use a `SKIPPED` MsgStatus value); commit.

### Task A3: OTP dual identity + channel switch

**Files:** `src/modules/iam/clientAuth.ts`; `src/modules/comms/templates.ts` (OTP email fallback/subject); `src/modules/cms/settings.ts` (comms setting `otpChannel`). Tests: extend `tests/iam/clientAuth.test.ts`.

**Changes:** add `resolveIdentifier(raw): {kind:"phone"|"email"; value:string}` (email regex, phone as today). `requestOtp(identifier, options)` and `verifyOtp(identifier, code, options)` accept either; Redis keys `otp:<kind>:<value>` etc.; delivery channel resolved per spec §2 (option → client pref → `SiteSetting("comms").otpChannel` → identifier-derived); render OTP for channel (email: subject+body), send via `resolveSenderForChannel`, log with `toPhone` or `toEmail`, redact code. `findOrCreateClientUser` becomes identifier-aware (lookup/create by phone or email). Keep dev `devCode`, atomic caps, timingSafeEqual.

**Steps:** TDD email-identifier request/verify (stub sender) asserting: email OTP stored/verified; new client created with email; devCode still returned in test; phone path unchanged. Add `otpChannel` to the typed settings registry (default "AUTO"). Commit.

### Task A4: Admin comms defaults + per-client preferences UI

**Files:** `src/app/admin/settings/*` (Communications section: otpChannel select + read-only booking channel), `src/app/admin/clients/[id]/*` (NotificationPreference editor + loyalty/credits placeholders wired later). Tests: light e2e or unit for the settings action.

**Steps:** extend `saveSettings` to persist `comms.otpChannel` (audited); add client-detail preference form calling `upsertPreference` (guard `CLIENT_MANAGE`). Commit.

### Task A5: Client account "Notifications" panel + book-flow identifier choice

**Files:** `src/app/[locale]/(site)/account/*`, `src/app/[locale]/(site)/book/*`, `src/i18n/messages/*`. Tests: e2e smoke (account panel renders; book accepts email).

**Steps:** account panel: choose channel + opt-in toggles (server action → upsertPreference for the logged-in client), and an "add email/phone" affordance that triggers OTP verification of the new identifier before attaching. Book wizard: accept email OR phone at the identify step (calls requestOtp/verifyOtp with the identifier). Localized copy (ar/en). Commit.

---

## Cluster B — Loyalty

### Task B1: Loyalty models + earn/redeem/auto-tier service

**Files:** `prisma/schema.prisma` (LoyaltyAccount, LoyaltyTransaction, `MembershipTier.minPoints Int @default(0)`), migration; create `src/modules/crm/loyalty.ts`; hook `src/modules/booking/bookings.ts` `complete()` (earn+tier) and `createBooking()` (optional redeem + `Booking.discountMinor Int @default(0)`). Tests: `tests/crm/loyalty.test.ts`, extend booking tests.

**Service:** `earnForBooking(bookingId)` idempotent (unique `(bookingId, reason)` on LoyaltyTransaction) awarding `floor(priceMinor/EARN_DIVISOR)`; `applyAutoTier(clientProfileId)` picks highest tier by `minPoints`≤balance and upserts membership if changed; `redeemPoints(clientProfileId, points, bookingId)` SERIALIZABLE, caps at balance and at booking price-equivalent, writes negative txn + sets `Booking.discountMinor`; `getLoyalty(clientProfileId)` → {balance, transactions, tier, nextTier}. `complete()` calls earn then applyAutoTier (after LTV refresh, best-effort, never breaks completion).

**Steps:** schema+migrate+generate; TDD earn idempotency, auto-tier threshold, redeem cap + double-spend safety; wire complete()/createBooking; commit.

### Task B2: Loyalty UI (client account + admin)

**Files:** account page (balance + history + tier progress), admin client detail (balance + manual adjust guarded+audited). Tests: unit/e2e light.
**Steps:** premium cards/progress bar using `.lunia-*`; manual-adjust server action (`CLIENT_MANAGE`, `recordAudit`). Commit.

---

## Cluster C — Gift cards & packages

### Task C1: Models + redemption services

**Files:** `prisma/schema.prisma` (GiftCard, GiftCardRedemption, ServicePackage, PackagePurchase, PackageRedemption + enums), migration; create `src/modules/commerce/giftcards.ts`, `src/modules/commerce/packages.ts`. Tests: `tests/commerce/giftcards.test.ts`, `tests/commerce/packages.test.ts`.

**Services:** `issueGiftCard({initialMinor, issuedToClientId?, expiresAt?})` (random unguessable `code`), `redeemGiftCard(code, amountMinor, bookingId?)` SERIALIZABLE, never negative, respects expiry/status, ledger row; `createPackage`, `purchasePackage(clientProfileId, packageId)` (sessionsRemaining=sessionsTotal), `consumePackageSession(packagePurchaseId, bookingId?)` SERIALIZABLE, never <0, ledger. Read helpers for balances/lists.

**Steps:** schema+migrate+generate; TDD balance decrement, over-redeem rejection, expiry/void, session consumption; commit.

### Task C2: Gift card/package UI (admin + client + booking)

**Files:** admin `/admin/commerce` (issue cards, create packages, view balances/redemptions; guard `SETTINGS_MANAGE` or `CLIENT_MANAGE` — pick+record); client account "My credits"; book flow gift-code / package application (records intended application; payments off). Tests: light.
**Steps:** premium UI; commit.

---

## Cluster D — Waitlist & rebooking

### Task D1: Waitlist model + join/notify service

**Files:** `prisma/schema.prisma` (WaitlistEntry + status enum + `WAITLIST_OPEN` MsgKind), migration; create `src/modules/booking/waitlist.ts`; hook `cancel()`/`reschedule()` to notify. Tests: `tests/booking/waitlist.test.ts`.

**Service:** `joinWaitlist({serviceId, desiredDateISO, clientProfileId? | {name, phone?/email?}, desiredWindow?})`; `notifyWaitlistForSlot(serviceId, dateISO)` — find WAITING entries, schedule `WAITLIST_OPEN` (`sendAt=now`, clientProfileId for prefs), mark NOTIFIED (bounded N). `cancel`/`reschedule` call `notifyWaitlistForSlot` best-effort after freeing a slot. Center-local dates.

**Steps:** schema+migrate+generate; TDD join + notify-on-free (mock/stub sender via outbox) + NOTIFIED transition; commit.

### Task D2: Waitlist UI + one-tap rebooking

**Files:** book flow (offer join when no slots), account page ("Book again" on past COMPLETED bookings → wizard prefilled), admin walk-up add + waitlist view. Tests: e2e light.
**Steps:** premium UI; rebook deep-link (`/book?service=<slug>&staff=<id>`), wizard reads params + lands on next available slot; commit.

---

## Cluster E — Reviews & reputation

### Task E1: Review model + request + submit service

**Files:** `prisma/schema.prisma` (Review + status enum + `REVIEW_REQUEST` MsgKind), migration; create `src/modules/reviews/reviews.ts`; hook `complete()` to schedule request. Tests: `tests/reviews/reviews.test.ts`.

**Service:** on `complete()`, schedule `REVIEW_REQUEST` `sendAt=completedAt + REVIEW_DELAY_DAYS` with a tokenized link (honors postVisitOptIn). `createReviewFromToken(token, {rating, body, locale, authorDisplayName, consentPublic})` (single-use token → PENDING). `approveReview`/`rejectReview` (audited). `getAggregate({serviceId?})` → {avg, count} over APPROVED; `listApprovedReviews(...)`.

**Steps:** schema+migrate+generate; TDD token single-use, request scheduling, approve→appears in aggregate; commit.

### Task E2: Review UI + public publish + AggregateRating JSON-LD

**Files:** public `/{locale}/review/<token>` submit page; admin `/admin/reviews` moderation (guard + audit); wire approved reviews into Results/Testimonials; `src/modules/seo/jsonld.ts` (+ `aggregateRatingJsonLd`/`reviewJsonLd`) injected on Home + Service pages. Tests: e2e (submit page renders; JSON-LD present when reviews exist).
**Steps:** premium UI; JSON-LD only when count>0; commit.

---

## Finalize

Full green-check (tsc/unit/build/e2e). Whole-branch review (most-capable model). Fix wave + re-review. Merge `feat/lunia-engagement` to main (`--no-ff`). Update `.env.example` (SMTP_*, COMMS_EMAIL_FROM) + RUNBOOK. Update memory. No VPS deploy (human-gated).

## Self-Review

Spec coverage: comms foundation (A1–A2), OTP/dual-identity/switch (A3–A5), loyalty (B), gift/packages (C), waitlist/rebooking (D), reviews+SEO/AggregateRating (E) — all mapped. Payments stay off (ledger-only). All balance spends SERIALIZABLE. New MsgKinds (WAITLIST_OPEN, REVIEW_REQUEST) + MsgStatus SKIPPED noted where used. Type consistency: CommsMessage/CommsSender widened once in A1 and consumed everywhere after.
