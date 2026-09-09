# Lunia Engagement Platform — Design Spec

**Date:** 2026-09-09
**Status:** Approved scope (user-confirmed: all four features + OTP/notification foundation; email via SMTP/nodemailer).

## Goal

Extend the Lunia platform with a multi-channel messaging foundation (add **email** alongside WhatsApp/SMS, make OTP delivery channel switchable, and let clients identify by phone **or** email), plus four client-engagement features: **loyalty**, **gift cards & packages**, **waitlist & rebooking**, and a **reviews/reputation engine** feeding public content + `AggregateRating` SEO.

## Non-negotiable constraints (inherited)

- No emojis in UI/code; no generic templates; premium, brand-guideline design (reuse the Stage-8 design system: `.lunia-*` utilities, brand tokens, motion).
- Bilingual: public site Gulf-Arabic default + RTL, English secondary; admin English default.
- No real message sends in dev/test — every channel (incl. email) falls back to a logging stub unless `NODE_ENV=production` AND the provider is configured.
- Secrets in env only; never logged/rendered. OTP codes never persisted (redacted in `CommunicationLog.body`).
- Money in integer minor units. Center timezone Asia/Riyadh via `centerLocalToUtc`/`utcToCenterLocal`.
- Server-side RBAC, guard-first (`requireAdmin(PERMISSION)`), Zod validation, SERIALIZABLE where double-spend is possible.
- Prisma 7 driver adapter; migrations via `migrator` target; keep the whole suite green (tsc, unit, build, e2e).
- Payments remain OFF (build-ready). Gift-card/package "purchase" records an issuance/redemption ledger; no real charge.

## 1. Comms foundation — email channel + generalized delivery

**Channel model.** `CHANNEL_VALUES` becomes `["whatsapp", "sms", "email"]`. Templates gain email support (subject + body). `MessageTemplate` stays keyed `(kind, locale, channel)`.

**Generalized recipient.** The current `CommsSender.send({channel, toPhone, body, kind, bookingId})` is phone-shaped. Introduce a superset:
- `CommsMessage = { channel: string; toPhone?: string; toEmail?: string; subject?: string; body: string; kind: string; bookingId?: string }`.
- `CommsSender.send(msg: CommsMessage): Promise<{ ok: boolean; providerRef?: string }>` (widen `toPhone` optional, add `toEmail`/`subject`). Existing SMS/WhatsApp adapters ignore `toEmail`/`subject`; they already read `toPhone`.
- New **EmailSender** adapter `src/modules/comms/providers/email.ts` (`makeEmailSender(cfg)`): nodemailer SMTP transport, `sendMail({from, to, subject, text})`, `try/catch → {ok:false}`, timeout, never logs secrets. Returns `{ok:true, providerRef: info.messageId}` only on a real send.

**Config.** `getCommsConfig` gains `email?: { host; port; user; pass; from }` read from `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/COMMS_EMAIL_FROM`; `emailConfigured` boolean. `sender.ts` gains `getEmailSender(env, nodeEnv)` (stub unless prod + emailConfigured).

**Channel router.** A single `resolveSenderForChannel(channel)` returns the right stub/real sender: `email → getEmailSender`, `sms → getSmsSender`, `whatsapp/other → getConfiguredSender`. Used by OTP and outbox.

**Dependency.** Add `nodemailer` (pinned) + `@types/nodemailer` (dev). SMTP is server-only; CSP unaffected.

## 2. OTP + dual identity + notification preferences

**Identifier.** OTP accepts a phone **or** an email. Add `resolveIdentifier(raw)` → `{ kind: "phone"|"email", value: normalized }`. Email normalized to lowercased trimmed, validated by a conservative regex. Redis keys become `otp:<kind>:<value>` etc.

**Delivery channel resolution (per OTP request):**
1. explicit request option (used by the client account "send me a test/login code via X"),
2. the client's stored **NotificationPreference.channel** (if the identifier maps to an existing client),
3. the **global default** `SiteSetting("comms").otpChannel`,
4. fall back: if identifier is an email → `email`; if phone → the global booking channel (sms/whatsapp).
An email identifier always delivers via email; a phone identifier delivers via sms/whatsapp (you cannot email a phone number). The "switch from number to email and back" is: change the identifier you log in with, and/or change the global/client channel.

**Delivery.** Render `OTP` template for the resolved channel/locale (email uses subject+body; add email OTP template fallback), send via `resolveSenderForChannel`, log to `CommunicationLog` (redact code; `toEmail` stored in a new nullable column, or reuse `toPhone` as a generic `recipient` — see schema note).

**Identity model.** `User` already has unique `phone?` and `email?`. `findOrCreateClientUser` becomes identifier-aware: look up by phone or email; create a `CLIENT` user with whichever was provided; a client may later add the other. `ClientProfile` unchanged.

**NotificationPreference** (new model, 1:1 with `ClientProfile`): `channel: CommsChannelPref` (AUTO | WHATSAPP | SMS | EMAIL), and booleans `remindersOptIn`, `postVisitOptIn`, `marketingOptIn` (default true except marketing default true but revocable). The **outbox** consults preferences: skip a scheduled message whose kind is opted out; route reminders/post-visit to the client's channel when set. OTP ignores marketing opt-out (transactional).

**Admin.** Settings gains a "Communications defaults" section (`otpChannel`, default booking channel already exists via `COMMS_BOOKING_CHANNEL` — surface it read-only + the new otpChannel). Client detail page shows/edits that client's NotificationPreference.

**Client account.** A "Notifications" panel: choose channel + toggle opt-ins; and an "add email/phone" affordance so a phone-first client can attach an email (and vice-versa) — attaching requires OTP verification of the new identifier.

## 3. Loyalty points & auto-tier upgrades

**Models.** `LoyaltyAccount` (1:1 `ClientProfile`, `pointsBalance Int @default(0)`), `LoyaltyTransaction` (`clientProfileId`, `deltaPoints Int`, `reason`, `bookingId?`, `createdAt`). Points are integers.

**Earn.** On `complete(booking)` (already refreshes LTV): award `floor(priceMinor / EARN_DIVISOR)` points (config constant, e.g. 1 pt per 1 SAR = per 100 minor) via a ledger transaction (idempotent per booking — unique `(bookingId, reason=EARN)`). Then **auto-tier**: pick the highest `MembershipTier` whose `priority`/threshold the client now meets (threshold from a new `MembershipTier.minPoints Int @default(0)`), and upsert `ClientMembership` if it changed (records a `LoyaltyTransaction` reason=TIER only as a note, no points).

**Redeem.** At `createBooking`, optional `redeemPoints` reduces the payable via a discount line (since payments are off, this records intent: store `discountMinor` on the booking + a `LoyaltyTransaction` delta negative). Guard balance with a SERIALIZABLE tx to prevent double-spend. Cap redemption at the booking price.

**UI.** Client account: points balance + history + tier progress bar. Admin client detail: balance, manual adjust (guarded, audited via `recordAudit`).

## 4. Gift cards & prepaid packages

**Models.**
- `GiftCard` (`code @unique`, `initialMinor`, `balanceMinor`, `currency`, `issuedToClientId?`, `status: ACTIVE|REDEEMED|VOID`, `expiresAt?`, `createdAt`). Code is a random, unguessable token.
- `GiftCardRedemption` (`giftCardId`, `amountMinor`, `bookingId?`, `createdAt`) — ledger.
- `ServicePackage` (`name*`, `serviceId?` or department scope, `sessionsTotal Int`, `priceMinor`, `isActive`), `PackagePurchase` (`clientProfileId`, `packageId`, `sessionsRemaining Int`, `status`, `createdAt`), `PackageRedemption` (`packagePurchaseId`, `bookingId?`, `createdAt`).

**Redemption.** At booking (or admin checkout), apply a gift card (by code) up to its balance, or consume one package session. SERIALIZABLE tx; decrement balance/sessions atomically; write the ledger row; never go negative.

**UI.** Admin: issue gift cards (amount, optional client, expiry), create packages, view balances/redemptions. Client account "My credits": gift-card balances + package sessions remaining. Booking flow: enter a gift-card code / choose an available package (records intended application; payments off).

## 5. Smart waitlist & one-tap rebooking

**Model.** `WaitlistEntry` (`serviceId`, `clientProfileId?` or `{name, phone/email}` for walk-up, `desiredDateISO`, `desiredWindow?`, `status: WAITING|NOTIFIED|CONVERTED|EXPIRED`, `createdAt`, `notifiedAt?`). Center-local dates.

**Join.** Public book flow: when `getServiceSlots` returns no free slot for the chosen day/service, offer "Join the waitlist" (collect identifier + desired date). Admin can add walk-ups.

**Notify-on-free.** `cancel()` and `reschedule()` free a slot; after freeing, enqueue a check: find `WAITING` entries for that service/date and schedule a `WAITLIST_OPEN` message (new kind) to the first N via the client's preferred channel, mark `NOTIFIED`. Dependency-light: reuse the outbox (`scheduleMessage` with `sendAt=now`), no new worker.

**Rebooking.** Account page: each past `COMPLETED` booking gets a "Book again" one-tap that deep-links the wizard prefilled with that service (and, when possible, the same staff), landing on the next available slot.

## 6. Reviews & reputation engine (+ SEO)

**Model.** `Review` (`clientProfileId?`, `bookingId? @unique`, `serviceId?`, `rating Int 1..5`, `title?`, `bodyEn?`/`bodyAr?` or single `body` + `locale`, `authorDisplayName?`, `status: PENDING|APPROVED|REJECTED`, `consentPublic Boolean`, `createdAt`, `approvedAt?`). A signed/opaque `token` for the submit link.

**Request.** On `complete(booking)`, schedule a `REVIEW_REQUEST` message (new kind) for `sendAt = completedAt + N days` via preferred channel, containing a tokenized link `/{locale}/review/<token>`. Honors post-visit opt-in.

**Submit.** Public tokenized page: rating + optional text + public-consent checkbox → creates a `PENDING` review. No auth beyond the token; token single-use.

**Moderate.** Admin `/admin/reviews` (new perm reuse: `CMS_MANAGE` or `CLIENT_VIEW` — pick + record): list PENDING, approve/reject (audited).

**Publish + SEO.** Approved+consented reviews feed the public **Results/Testimonials** sections and inject `Review` + `AggregateRating` JSON-LD on Home and relevant Service pages (resolves the Stage-3 `AggregateRating` deferral). Aggregate = avg rating + count over approved reviews.

## Schema note — CommunicationLog recipient

`CommunicationLog.toPhone` is phone-shaped. Add nullable `toEmail String?` (keep `toPhone` nullable) so email sends log correctly; readers show whichever is present. Alternatively a generic `recipient` — but additive `toEmail` is lower-risk. Choose `toEmail` additive.

## Rollout / ordering

1. **Comms foundation** (email channel, generalized sender, config, channel router, CommunicationLog.toEmail) — everything else notifies through it.
2. **OTP + dual identity + NotificationPreference** (+ admin/account UI).
3. **Loyalty**, **Gift cards & packages**, **Waitlist & rebooking**, **Reviews & SEO** — each self-contained, built on 1–2.

Each feature ships schema + service (+ tests) + admin UI + public UI, reviewed per task. No VPS deploy; pause for the user before any deploy. New env vars documented in `.env.example` + RUNBOOK.

## Out of scope (now)

Real payment capture; SMS→email delivery-status webhooks; multi-currency; referral program; per-district GEO pages (separate). These are noted as follow-ups.
