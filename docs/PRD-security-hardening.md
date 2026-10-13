# PRD: Security hardening (follow-up to the October 2026 audit)

Status: **approved and built 2026-10-14**

Decisions:
- **Backups:** off-site copy to an S3-compatible bucket, encrypted before upload.
- **Invoice links:** valid for 60 days; links already sent keep working for 60 days after release.
- **Strict CSP:** applies to the admin and the customer account only.

## Problem

The October audit left five items open (docs/KNOWN_ISSUES.md §3):

1. **No scheduled backups.** `deploy/scripts/backup.sh` works but nothing runs it, and nothing copies its output off the VPS. If the server or its disk is lost, all customer, clinical and billing data is lost.
2. **Invoice links never expire.** The link is a signed token (`src/modules/billing/token.ts`) with no date in it. Anyone holding an old WhatsApp or email link can see the customer's name, phone number and amounts forever.
3. **The CSP allows `'unsafe-inline'` scripts** (`src/middleware.ts`). If an XSS bug ever slips in, the browser won't block it.
4. **The webhook check is partial.** A Moyasar delivery that carries no `secret_token` field skips the token check. This is mitigated, because the status is always re-fetched from Moyasar with our key, but it should be strict.
5. **Gift cards that may have been issued for free.** Online gift card orders placed before 2026-10-14 used a stub charge. Production hasn't been checked for these.

## Success criteria

- A database and media backup runs every night without anyone touching it, a copy leaves the VPS, and a failure is visible to someone.
- An invoice link stops working after a set period. Re-sending the invoice issues a fresh link. Links already sent keep working through a grace period, so no customer gets a dead link the day this ships.
- Script injection is blocked by the browser on the sensitive areas (staff admin and the customer account), with no broken pages.
- A webhook without a valid secret token is rejected whenever a secret is configured. Admin shows a warning while the secret is missing.
- We know how many stub-paid gift cards exist in production, without exposing customer data.

## Scope

**In scope:**
- Backups:
  - A cron entry on the VPS, installed by the deploy workflow so it's version-controlled.
  - An off-site copy to the destination you choose.
  - Retention: 14 days local, 30 days off-site.
  - A JobRun-style "last backup" status shown on the admin automations card.
- Invoice links: a versioned token with an expiry date, a friendly "this link has expired, ask the clinic for a new one" page, and the grace period for old links.
- CSP: per-request nonces where you choose (see Q3), plus the related headers.
- Webhook: strict token check, plus an admin warning when the secret is missing.
- Gift cards: a read-only count of stub-paid orders, printed in the deploy log (counts only, no names).
- Tests, RUNBOOK and KNOWN_ISSUES updates.

**Out of scope:**
- Wiring real Moyasar charging for gift cards.
- Refunding or voiding any stub-paid cards. Once we know the number, that's your decision.
- Rotating existing secrets.

## Constraints

- Production changes go through the deploy workflow only. There's no direct SSH from this session.
- Off-site storage needs credentials I don't have. You add them as GitHub Actions secrets; I never see the values.
- Nonce-based CSP forces every page that uses it to render per request, so those pages can't be served from the static cache.

## Build plan

1. **Webhook:** strict check and admin warning, with unit tests.
2. **Invoice tokens:**
   - v2 token carries the issue date; v1 tokens are accepted until the grace period ends.
   - Expired-link page in English and Arabic.
   - Re-send mints a new token.
   - Tests.
3. **CSP:**
   - Middleware generates a nonce and passes it via request header; the root layouts read it.
   - Third-party scripts (analytics/pixels) get the nonce.
   - Run the full e2e suite to catch blocked scripts.
4. **Backups:**
   - Extend `backup.sh` with the off-site upload, a failure exit code and a status ping.
   - The deploy workflow installs `/etc/cron.d/lunia-backup`.
   - Admin status line.
   - RUNBOOK restore steps updated.
5. **Gift card check:** a read-only SQL count in the deploy step's output.
6. **Ship:** full verification (tsc, eslint, vitest, e2e, build), push, watch the deploy, confirm the first backup lands.
