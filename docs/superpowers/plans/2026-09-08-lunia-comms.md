# Lunia Communications — Implementation Plan (Stage 6 of 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Turn the stubbed messaging pipeline into real, provider-backed WhatsApp/SMS — booking confirmation, 24h reminder, and post-visit messages rendered from editable bilingual templates and delivered through a pluggable provider (Meta WhatsApp Cloud API / Twilio / Unifonic SMS) selected by env; the client OTP sends a real SMS in production; and an admin Communications area shows the log, edits templates, and reports provider status. Everything degrades safely to the existing stub (log-only) when no provider is configured, so dev/test/CI never send real messages.

**Architecture:** New `comms` module: provider adapters implementing the EXISTING `CommsSender` interface (`src/modules/booking/outbox.ts`), a `getConfiguredSender()`/`getSmsSender()` selector reading env, a `MessageTemplate` model + registry that renders bilingual bodies with booking/client params (replacing the hard-coded `renderMessageBody`). The worker's default sender becomes the configured provider. `requestOtp` sends via the SMS sender in production. Admin `/admin/comms` for log + templates + provider status. No secrets in code; adapters unit-tested with mocked `fetch`.

**Tech Stack:** Existing repo stack. Reuse: `CommsSender`/`processDueMessages`/`stubSender` (outbox.ts), `worker/index.ts`, `src/modules/iam/clientAuth.ts` (requestOtp), `requireAdmin`/`AdminShell`/`DataTable`, `PERMISSIONS.SETTINGS_MANAGE`, `getEnv`/env. `prisma` adapter. `zod`.

**Spec:** `docs/superpowers/specs/2026-09-07-lunia-platform-design.md` (§8 Communications, §Communications automation).

## Global Constraints

- **NO real external sends in dev/test/CI.** Provider adapters are exercised ONLY via unit tests with a mocked `fetch` (assert the correct request shape + parse a canned response); the default sender is the stub unless env explicitly configures a provider. `getConfiguredSender()` returns `stubSender` when `NODE_ENV !== "production"` OR no provider env is set. Never hit a real provider from a test.
- **Secrets only via env; never committed.** Add provider env vars as OPTIONAL (document every one in `.env.example`): `COMMS_PROVIDER` (`none|meta_whatsapp|twilio|unifonic`, default `none`), `COMMS_FROM` (sender id/number), and provider creds (`META_WA_TOKEN`, `META_WA_PHONE_ID`; `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`; `UNIFONIC_APP_SID`, `UNIFONIC_SENDER_ID`). The admin provider-status panel shows provider name + configured/not-configured booleans ONLY — never the secret values.
- **Provider prerequisites are client-supplied** (WhatsApp Business API verification + pre-approved message templates, an SMS account). The code is ready and switches on when env is set; document this. For Meta WhatsApp, support a `providerTemplateName` per MessageTemplate (approved template) with positional params, falling back to a plain text/session message where allowed.
- Bilingual (ar/en) message bodies; times rendered in Asia/Riyadh; money minor→SAR where shown. Admin is English/LTR, permission-guarded guard-first (SETTINGS_MANAGE). TS strict (no unjustified any), no emojis in code, conventional commits, TDD, each task committed + green. Prisma migrations committed; seed idempotent. The pipeline must remain resilient: a send failure marks the message FAILED + a CommunicationLog row, never crashes the worker.

---

## File Structure

```
prisma/schema.prisma          # + MessageTemplate
prisma/seed.ts                # + default MessageTemplates (from current renderMessageBody text, richer)
src/modules/comms/
  config.ts                   # reads optional provider env → typed CommsConfig
  sender.ts                   # getConfiguredSender(), getSmsSender(), provider selection
  templates.ts                # MessageTemplate registry: get/list/upsert + render(kind,locale,channel,params)
  providers/{meta.ts,twilio.ts,unifonic.ts,index.ts}   # CommsSender adapters (fetch-based)
src/modules/booking/outbox.ts # renderMessageBody → delegate to comms/templates; channel from config
worker/index.ts               # default sender = getConfiguredSender()
src/modules/iam/clientAuth.ts # requestOtp → send SMS via getSmsSender() in production
src/app/admin/comms/{page.tsx, templates/*, actions.ts}   # log + template editor + provider status
```

---

## Task 1: MessageTemplate model + registry + richer render

**Files:** `prisma/schema.prisma` (+ MessageTemplate), migration, `prisma/seed.ts`, `src/modules/comms/templates.ts`, `tests/comms/templates.test.ts`.

- `MessageTemplate` { id, kind String (CONFIRMATION|REMINDER_24H|POST_VISIT|OTP), locale String (ar|en), channel String (whatsapp|sms), bodyTemplate String @db.Text, providerTemplateName String?, isActive Boolean @default(true), updatedAt; @@unique([kind, locale, channel]) }.
- `templates.ts`: `renderTemplate(kind, locale, channel, params: Record<string,string>): Promise<{ body: string; providerTemplateName?: string }>` — load the active template for (kind,locale,channel) with fallback (channel whatsapp→sms, locale ar→en, and finally a built-in default mirroring today's `renderMessageBody`), interpolate `{{placeholders}}` from params (e.g. {{serviceName}}, {{dateTime}}, {{code}}). `listTemplates()`, `getTemplate(kind,locale,channel)`, `upsertTemplate(...)` (validate).
- Seed idempotent default templates for CONFIRMATION/REMINDER_24H/POST_VISIT × (ar,en) × whatsapp using the current bilingual copy, enriched with {{serviceName}}/{{dateTime}} placeholders, + an OTP template (ar,en, sms) "Your Lunia code is {{code}}".

- [ ] Add model; migrate `--name comms`; generate. TDD renderTemplate (interpolation, fallbacks). Seed idempotent (2x). Commit `feat(comms): message template model + registry`.

## Task 2: Provider config + selector

**Files:** `src/modules/comms/config.ts`, `src/modules/comms/sender.ts`, `.env.example` (+ optional vars), `tests/comms/sender.test.ts`.

- `config.ts`: `getCommsConfig(): { provider: "none"|"meta_whatsapp"|"twilio"|"unifonic"; from?; meta?{token,phoneId}; twilio?{sid,token,from}; unifonic?{appSid,sender}; configured: boolean }` reading `process.env` (all optional). No throw when unset.
- `sender.ts`: `getConfiguredSender(): CommsSender` — if `NODE_ENV !== "production"` OR config.provider === "none"/unconfigured → return `stubSender`; else return the matching provider adapter (Task 3). `getSmsSender(): CommsSender` — prefer an SMS-capable provider (unifonic/twilio); stub if none/dev. Pure selection logic; testable by injecting env.
- `.env.example`: document COMMS_PROVIDER + COMMS_FROM + all provider creds as optional, with a comment that real sends require client-provided creds + (WhatsApp) approved templates.

- [ ] TDD sender selection: NODE_ENV test → stub; provider "none" → stub; a configured provider (env set, NODE_ENV=production simulated) → the right adapter type. Commit `feat(comms): provider config + sender selector`.

## Task 3: Provider adapters (Meta WhatsApp, Twilio, Unifonic)

**Files:** `src/modules/comms/providers/{meta.ts,twilio.ts,unifonic.ts,index.ts}`, `tests/comms/providers.test.ts`.

- Each exports a factory returning a `CommsSender` bound to its config. `send({channel,toPhone,body,kind,bookingId})` calls the provider HTTP API via `fetch`:
  - `meta.ts`: POST `https://graph.facebook.com/v21.0/{phoneId}/messages` with Bearer token; if a `providerTemplateName` is supplied (passed through — extend the send input or resolve from templates), send a template message, else a text message. Return `{ok, providerRef: message id}` on 2xx, `{ok:false}` on error.
  - `twilio.ts`: POST the Messages API with Basic auth (sid:token), `From`/`To`/`Body` (whatsapp: prefix for WhatsApp). 
  - `unifonic.ts`: POST Unifonic REST send with AppSid + SenderID + Body + Recipient.
  - Each: timeouts/try-catch → `{ok:false}` on any failure (never throw to the worker). Do NOT log secrets.
- `index.ts`: `makeSender(config): CommsSender` picks the adapter by provider.

- [ ] TDD with a MOCKED global.fetch (vi.stubGlobal or inject a fetch): each adapter builds the correct URL/method/headers/body for a sample message and maps a canned 2xx → {ok, providerRef} and a 4xx/throw → {ok:false}. NO real network. Commit `feat(comms): whatsapp/sms provider adapters`.

## Task 4: Wire outbox render + worker + booking payload

**Files:** modify `src/modules/booking/outbox.ts` (render via templates, channel from config), `worker/index.ts` (default sender = getConfiguredSender), modify `src/modules/booking/bookings.ts` (richer scheduleMessage payload: serviceName, dateTime, locale), `tests/comms/pipeline.test.ts`.

- outbox `processDueMessages`: render the body via `comms/templates.renderTemplate(kind, message.locale, channel, params)` where params come from the ScheduledMessage.payload (serviceName, dateTime, etc.); channel from `getCommsConfig().provider` mapping (whatsapp for meta/twilio-wa, sms for unifonic/twilio-sms) — keep a sane default. Keep the SENT/FAILED + CommunicationLog behavior. Keep `renderMessageBody` as a built-in fallback used by templates.
- worker: `processDueMessages(new Date(), getConfiguredSender())`.
- bookings.createBooking: when scheduling CONFIRMATION/REMINDER_24H/POST_VISIT, include payload { serviceName (localized), dateTime (center-local formatted), bookingId } so templates render real details.

- [ ] TDD the pipeline with a FAKE sender: schedule a message with payload → processDueMessages renders a body containing the service name + time → fake sender receives it → SENT + CommunicationLog. A failing fake sender → FAILED + log. Commit `feat(comms): render templates in pipeline + richer payload`.

## Task 5: Client OTP real SMS

**Files:** modify `src/modules/iam/clientAuth.ts` (requestOtp), `tests/iam/clientAuth.test.ts` (extend).

- `requestOtp(phone)`: keep generating + storing the code + rate-limiting. In PRODUCTION with an SMS sender configured, ALSO send the code via `getSmsSender().send({channel:"sms", toPhone:phone, body: renderTemplate("OTP", locale?, "sms", {code}), kind:"OTP"})` (best-effort: a send failure logs + still stores the code; do not leak). Continue returning `{devCode}` ONLY in non-production. Add a `CommunicationLog` row for the OTP send (kind OTP). Locale: default "ar" or accept an optional locale param.

- [ ] TDD: in test/dev env, requestOtp returns devCode and does NOT call a real provider (stub); with a fake SMS sender injected + production-simulated, it calls send with the code body. Keep existing OTP tests green. Commit `feat(comms): send OTP via sms in production`.

## Task 6: Admin Communications (log + templates + provider status)

**Files:** `src/app/admin/comms/{page.tsx, actions.ts}`, `src/app/admin/comms/templates/{page.tsx, actions.ts}`, AdminNav link (SETTINGS_MANAGE), `e2e/admin-comms.spec.ts`.

- `/admin/comms` (guard SETTINGS_MANAGE): a provider-status panel (provider name + which creds are configured — booleans only, NEVER secret values, from getCommsConfig().configured/provider), and a CommunicationLog table (recent sends: channel, kind, toPhone, status, createdAt) with filters + pagination.
- `/admin/comms/templates` (guard SETTINGS_MANAGE): list MessageTemplates; edit bodyTemplate (+ providerTemplateName) per (kind,locale,channel) via upsertTemplate; show the available {{placeholders}} per kind. Actions re-check SETTINGS_MANAGE.
- AdminNav: "Communications" link gated SETTINGS_MANAGE.

- [ ] e2e: owner → /admin/comms shows provider status (Not configured in dev) + a log table; → templates → edit a template body → save → persists (reload). Commit `feat(admin): communications log + templates + provider status`.

## Task 7: Polish, resilience, docs & full verification

**Files:** RUNBOOK/docs note on configuring a provider (env + WhatsApp template approval), audit, full test/e2e.

- Document in `docs/RUNBOOK.md` (or a comms doc) how to enable a provider: set COMMS_PROVIDER + creds, seed/approve WhatsApp templates, set providerTemplateName on templates. Confirm: with no env, dev/test use the stub (no real sends); the worker + OTP both route through getConfiguredSender/getSmsSender; CommunicationLog captures every attempt; failures never crash the worker.
- Ensure `.env.example` documents all comms vars; the provider-status panel leaks no secrets.

- [ ] Full `pnpm test` + `pnpm e2e` green; `pnpm build` clean. Commit `docs(comms): provider setup runbook + final wiring`.

---

## Self-Review

- **Spec coverage (Stage-6):** booking confirmation ✓, 24h reminder ✓, post-visit ✓ (T1,T4); WhatsApp + SMS providers ✓ (T3) behind the interface ✓ (T2); real OTP SMS ✓ (T5); templates editable ✓ (T1,T6); comms log ✓ (T6). Real sends gated on client-provided creds — documented (T7).
- **Deps:** T1→T2→T3→T4→(T5,T6)→T7.
- **Safety:** no real sends without explicit production env; adapters unit-tested with mocked fetch only; secrets never in code or the admin UI.
- **Not in scope:** inbound message handling / two-way chat; marketing broadcast campaigns; delivery-receipt webhooks (could be a later enhancement).
