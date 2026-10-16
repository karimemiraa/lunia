# Lunia — Production Runbook

Scope: this covers the deploy skeleton introduced in the Foundation build
(Task 11) — the Docker image, `docker-compose.prod.yml` stack, Nginx/TLS
config, and backup/restore scripts. **Nothing in this repo has been deployed
to the VPS yet.** Actually standing up the stack on the live server is a
separate, explicitly approved step — this document is what you follow when
that step happens.

## 1. Environment variables

The app validates its environment at startup via `src/lib/env.ts` (zod). All
of the following are required — a missing or malformed one fails the build
and the running server:

| Variable | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://lunia:<password>@postgres:5432/lunia?schema=public` | Points at the `postgres` service by its compose service name, not `localhost`. |
| `REDIS_URL` | `redis://redis:6379` | Same — service name, not `localhost`. |
| `SESSION_SECRET` | 32+ random characters | Generate with `openssl rand -base64 48`. Never reuse the local-dev value. |
| `APP_URL` | `https://lunia.example` | The public URL once a domain/cert exists; `http://<vps-ip>` is fine before that. |
| `NODE_ENV` | `production` | |

The Postgres container additionally needs its own bootstrap variables (read
by the official `postgres` image, not by the app):

| Variable | Example |
|---|---|
| `POSTGRES_USER` | `lunia` |
| `POSTGRES_PASSWORD` | a strong random password |
| `POSTGRES_DB` | `lunia` |

Put all of the above into a `.env.prod` file at the repo root on the VPS.
**`.env.prod` is git-ignored (see `.gitignore`'s `.env.*` pattern) and must
never be committed.** Seed variables for the initial owner account
(`SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`) belong here too if the seed
script is run in production — see `.env.example` for the full shape used in
local dev, which `.env.prod` mirrors with production values.

Only `app` and `postgres` read `.env.prod` in `docker-compose.prod.yml`
(`env_file: .env.prod`); make sure `DATABASE_URL`/`REDIS_URL` in it use the
compose service hostnames (`postgres`, `redis`), not `localhost`.

### 1a. Media storage (Backblaze B2)

In production all uploaded media (hero images, brand logos, service photos,
gallery, etc.) is stored in a private Backblaze B2 bucket over its
S3-compatible API, rather than on the container's disk. The app still serves
every asset through `/api/media/<key>` (it reads the bytes from B2 server-side),
so the bucket stays **private** — no public bucket, presigned URLs, or CDN are
required. Set these in `.env.prod`:

| Variable | Example | Notes |
|---|---|---|
| `B2_BUCKET` | `Lunia-skin-Q` | The bucket name (not its ID). |
| `B2_ENDPOINT` | `s3.eu-central-003.backblazeb2.com` | S3 endpoint from the bucket page; scheme optional. |
| `B2_REGION` | `eu-central-003` | The region embedded in the endpoint. |
| `B2_KEY_ID` | `00…` | Application **keyID** from B2 → App Keys. |
| `B2_APP_KEY` | `K003…` | The application key secret (shown once at creation). |

Create a B2 **Application Key** scoped to just this bucket (read + write) — do
not use the master key. When these are set the app uses B2 automatically; unset
(or `STORAGE_DRIVER=local`) it falls back to the on-disk `uploads/` volume. The
`uploads:` volume in `docker-compose.prod.yml` is then unused but harmless.

## 2. First boot (new VPS)

Run everything from the repo root on the VPS.

1. Clone the repo and check out the deploy branch/tag.
2. Create `.env.prod` (see section 1). Keep a copy of it somewhere safe
   outside the repo — losing it means losing DB access and session signing.
3. Create the certbot bind-mount directories (compose will otherwise create
   them as root-owned on first `up`, which is fine, but doing it explicitly
   avoids surprises):
   ```bash
   mkdir -p deploy/certbot/conf deploy/certbot/www
   ```
4. Build and start everything except don't rely on `deploy.sh` for the very
   first boot, since it assumes a prior deployment exists to migrate
   forward from. Instead:
   ```bash
   docker compose -f docker-compose.prod.yml build
   docker compose -f docker-compose.prod.yml up -d postgres redis
   docker compose -f docker-compose.prod.yml --profile tools run --rm migrate prisma migrate deploy
   docker compose -f docker-compose.prod.yml --profile tools run --rm migrate tsx prisma/seed.ts
   docker compose -f docker-compose.prod.yml up -d
   ```
   Migrations and seeding always run against the `migrate` service, which
   builds from the `migrator` target (reuses the `build` stage's full
   `node_modules`, prisma + tsx included) — never against the `app` service,
   which is meant for serving the app, not for one-off tooling commands.
   `migrate` is gated behind the `tools` Compose profile so it never starts
   as part of routine `docker compose up`.
5. Confirm the app is reachable over plain HTTP through Nginx:
   `curl http://<vps-ip>/api/health` should return `{"status":"ok",...}`.
6. Point the domain's DNS A/AAAA record at the VPS if not already done, and
   wait for it to propagate.
7. Issue a certificate with certbot's webroot method, using the same
   `deploy/certbot/conf` and `deploy/certbot/www` volumes Nginx already
   mounts:
   ```bash
   docker run --rm \
     -v "$(pwd)/deploy/certbot/conf:/etc/letsencrypt" \
     -v "$(pwd)/deploy/certbot/www:/var/www/certbot" \
     certbot/certbot certonly --webroot -w /var/www/certbot \
     -d your-domain.example --email you@example.com --agree-tos --no-eff-email
   ```
8. Edit `deploy/nginx/lunia.conf`: replace `server_name _;` with the real
   domain, uncomment the `return 301 https://$host$request_uri;` line and
   the whole HTTPS `server {}` block, then reload Nginx:
   ```bash
   docker compose -f docker-compose.prod.yml restart nginx
   ```
9. Set up certbot renewal (Let's Encrypt certs expire every 90 days) via a
   host cron entry, e.g.:
   ```
   0 3 * * * cd /path/to/lunia && docker run --rm \
     -v "$(pwd)/deploy/certbot/conf:/etc/letsencrypt" \
     -v "$(pwd)/deploy/certbot/www:/var/www/certbot" \
     certbot/certbot renew --webroot -w /var/www/certbot --quiet \
     && docker compose -f docker-compose.prod.yml restart nginx
   ```

## 3. Routine deploy

```bash
./deploy/scripts/deploy.sh
```

This does `git pull --ff-only`, rebuilds the `app` image, runs
`prisma migrate deploy` against the running Postgres via the `migrate`
service (the `migrator` build target — see section 2), then
`docker compose up -d` to restart the stack with the new image. It refuses
to run without a `.env.prod` present. Take a `backup.sh` snapshot first if
the migration is non-trivial.

### 3.1 CI gate (GitHub Actions)

Pushing to `main` runs `.github/workflows/deploy.yml`. Its `verify` job runs
on a fresh Postgres 16 and Redis: migrate, seed, `tsc`, `eslint` and the full
`vitest` suite. The `build-and-deploy` job runs **only if `verify` passes**,
so a red test blocks the deploy (the live site keeps running the previous
version). To ship a hotfix, fix the test or the code. Don't bypass the gate.

### 3.2 Scheduled automations (worker)

The `worker` service runs the daily jobs in `src/modules/automation/jobs.ts`
on every tick (Riyadh time). Each job runs at most once a day, because it
claims a unique `JobRun(job, day)` row first; this holds even with several
replicas or restarts.

| Job | Time | Default | What it does |
|---|---|---|---|
| waitlist-expiry | 01:00 | on | Waitlist entries for past dates → EXPIRED |
| package-expiry | 01:00 | on | Package purchases past `expiresAt` → EXPIRED |
| gift-card-expiry | 01:00 | always | Active gift cards past `expiresAt` → EXPIRED |
| auto-no-show | 02:00 | **off** | CONFIRMED visits never checked in, ended ≥ N hours ago (default 24; looks back 14 days) → NO_SHOW |
| staff-digest | 08:00 | **off** | Emails each assignee their open items |
| package-reminders | 10:00 | on | "Your package expires soon" to the customer (once per purchase) |
| invoice-reminders | 10:00 | **off** | Re-sends an unpaid invoice (with pay link if online payments are set up) after N days and again after 2N — max 2 per invoice (`Invoice.remindersSent`); WhatsApp, or email if no phone; test customers skipped |
| win-back | 11:00 | **off** | "We miss you" to customers with no visit in N days and nothing booked |

- **Where to toggle them:** owners switch jobs on or off, and set the thresholds, under **Settings → Automations**. The last run and its result are shown there too, from the `JobRun` table.
- **Delivery:** customer messages go through the normal outbox, so opt-outs apply. Win-back is marketing and is skipped for customers who opted out of offers. Each customer gets win-back at most once every 180 days, and there's a daily cap.
- **Wording:** edit it under Communications → Message templates (*Package expiring soon*, *We miss you*).

### 3.3 Website results gallery (patient photos)

Clinical photos are private. A before/after pair appears on `/results` only when **all** of these are true:

1. Staff ticked "Customer consented to show it on the website" on **both** photos. Only do this with the customer's written consent.
2. The pair is one customer's Before and After.
3. The pair is published (Website → Results gallery).

The public image route `/api/results/[id]/[side]` re-checks this on every request and caches for at most 5 minutes. Withdrawing consent on a photo unpublishes its pairs immediately. Deleting a photo deletes its pairs. Names and dates are never sent to the public site.

### 3.4 Paid memberships

Monthly plans live under **Finance → Memberships**. Billing a membership month means issuing an invoice, so the clinic's tax details must be complete (**Invoices & payments → settings**); otherwise enrolment is refused with that error.

How a membership runs:

- **Enrolling** issues month 1's invoice and sends it to the customer, with a Moyasar pay link when online payments are configured. Otherwise they pay at the desk like any invoice.
- **When an invoice is paid,** benefits switch on for that month. This happens in `settleInvoice` → `onMembershipInvoicePaid`, inside the payment transaction:
  - The plan's discount on treatments and products is applied automatically when a draft invoice is created for the member. Staff can still edit it, and a note records it.
  - The included sessions are credited as a package valid until the month ends, so they don't roll over. They're redeemed at checkout as "Package session".
- **Every day at 09:00 Riyadh,** the worker job `membership-billing` does three things:
  - Invoices the next month when the current one ends.
  - Ends memberships whose scheduled cancellation date has arrived.
  - Marks a membership **Past due** (benefits off) when a month stays unpaid past the plan's grace days. Paying the invoice makes it Active again.
- **Cancel** ends the membership after the paid month, or at the end of the minimum term if that's later; months until then are still billed. **Cancel now** ends it immediately and leaves any unpaid invoice open. Use a credit note if it shouldn't be paid. **Pause** stops billing; **Resume** starts a fresh month and invoices it.
- **No card is ever charged automatically.** Lunia has pay-by-link only; Moyasar card tokenisation isn't enabled.

### 3.5 Recurring appointments

In **Calendar → Book walk-in**:

1. Pick the first visit's time.
2. Tick **Repeat this booking**, then set how often and how many visits (2–26).
3. Click **Check dates**. Each date is checked against live availability, preferring the same specialist.
4. Confirm. Dates that aren't free are skipped and listed so you can book them separately; nothing is ever double-booked.

Each visit is a normal booking linked by `Booking.seriesId`, with a "Series" badge in the day view. The customer gets **one** confirmation and a 24h reminder before every visit. **Cancel this and following** (in a visit's actions) cancels that visit and every later one that hasn't happened yet.

### 3.6 Safety rules added in the October 2026 audit

- **Online gift card sales are switched off in production.** There is no real card charge wired up for gift cards yet, so the public gift card page shows "not available online" and `chargeGiftCard` always declines in production (dev/test still use a stub). Staff can still issue gift cards from Commerce. Before re-enabling, wire `chargeGiftCard` (`src/modules/commerce/giftShop.ts`) to Moyasar.
- **Rate limits** (Redis, `src/lib/rateLimit.ts`, fail open if Redis is down): OTP start 20/hour per IP; client password login 30 per 15 min per IP plus the per-account lockout used for staff; contact form 8/hour; waitlist 10/hour.
- **Client IP** comes from `X-Real-IP` (set by nginx) or the *last* `X-Forwarded-For` hop — never the first, which the visitor controls (`src/lib/requestIp.ts`).
- **Staff "view as customer"** sessions are tagged in Redis; they can't change the customer's password, notification preferences, health profile or sign consents.
- **Bookings:** cancelling twice is a no-op; a no-show can't be cancelled; a checked-in visit can't be rescheduled; the waitlist is only notified when a *future* slot frees up.
- **Membership renewals** are anchored to the enrolment (or resume) day, so a Jan 31 membership renews Feb 28 → Mar 31, not Mar 28 forever (`MembershipSubscription.billingAnchorAt`).
- **Dates** in exports, stock-take notes and admin tables are shown in Riyadh time.
- **Invoice links expire after 60 days** (`src/modules/billing/token.ts`). Every send mints a fresh link, so re-sending the invoice (manually or via the reminder job) gives the customer a working one. Links sent before 2026-10-14 work until 2026-12-14. Customers signed in to their account always get fresh links. An expired link shows "This link has expired" with no invoice data.
- **Strict script policy** (`src/middleware.ts`): admin, superadmin, `/account` and `/invoice` pages get a per-request nonce with `'strict-dynamic'`, so a script injected into those pages doesn't run. Public marketing pages keep `'unsafe-inline'` so they stay statically cached; they hold no private data. Any new inline `<script>` in a private area must take the nonce from the `x-nonce` request header (see `src/app/admin/layout.tsx`).
- **Payment webhook:** Moyasar events must carry `PAYMENT_WEBHOOK_SECRET`. Invoice callbacks (which carry no token) must arrive on our HMAC-signed callback URL (`?cb=`); unsigned callbacks are refused, except for pay links created before 2026-10-15. The tax settings page warns while the webhook secret isn't set.
- **Gift card stub check:** every deploy prints, in the Actions log, how many gift cards were issued by the old stub charge and how much balance is still usable (totals only; `deploy/scripts/check-gift-stubs.sh`).

### 3.7 Arabic (customer-facing)

- **Voice:** Gulf/Saudi dialect with feminine address on the website, booking, account and customer messages. Clear formal Arabic on the health questionnaire, consent forms and invoices. Rules and approved terms: `docs/arabic-glossary.md`. Every change, for native review: `docs/arabic-review-sheet.md`.
- **Website text** lives in `src/messages/ar.json`. Any new English key needs an Arabic one; the i18n unit test fails otherwise.
- **Names customers see** have an optional Arabic field. When it's blank, the English name shows:
  - membership tiers (Admin → Tiers)
  - rooms (Booking settings → Rooms)
  - staff (Users → "Save Arabic name")
  - journal authors (Journal post → "Author name (Arabic)")

  **Set the Arabic name for every specialist**, since customers see it on their booking.
- **"No English" check:** `e2e/arabic-coverage.spec.ts` opens every public page, each booking step and the signed-in account in Arabic, and fails on any visible English word. Allowed: brand and product names, codes, numbers, emails, phones, and anything marked `lang="en"` or `data-i18n-ignore`. Add new public routes to its list.

### 3.8 Arabic (staff console)

- **Switching:** staff choose «العربية» in the Display menu (half-moon button). The whole console switches to Arabic and right-to-left: menus, page content, dialogs, toasts, dates (Gregorian, Western digits) and Ask Lunia's replies. The choice is remembered per device (cookie `lunia_staff_locale`).
- **How strings work:** the source text is the English UI text itself: `t("Save changes")` in server code (`getStaffT()`), `useStaffT()` in client components. Arabic lives in `src/app/admin/_i18n/ar/<area>.ts`, one file per admin area, merged in `ar/index.ts`. Missing entries fall back to English.
- **Words with two meanings** (e.g. "Open" the button vs an opening time) use context keys like `"Open (hours)"` via `translateIn()`. English still shows the plain word.
- **Tests:**
  - `tests/admin/i18n.test.ts` fails when an entry isn't Arabic, loses a `{placeholder}`, or translates the same English two different ways. It also checks that every Ask Lunia guide has Arabic quoting real UI labels.
  - `e2e/admin-arabic.spec.ts` opens every admin page plus one of each detail page in Arabic. It fails when an English UI string from the admin source is still visible.
- **Adding a screen:** wrap every visible string in `t()` and add its Arabic to that area's dictionary file. Run both tests.
- **Stays English by design:** audit-log summaries, automation run results, CSV export files, provider names, and anything staff typed (customer names, notes, custom role or stage names).

### 3.9 Visit journey (in-clinic flow)

Full design: `docs/PRD-visit-journey.md`. Code: `src/modules/booking/journey.ts`, the board at `src/app/admin/visits/`.

- **Where staff use it:**
  - **Front desk → Visit board** (`/admin/visits`) shows today's customers in columns: Expected → Waiting → Consultation → In treatment → Checkout → Left today. Each card has a live timer and one main next action.
  - Specialists without booking:manage open on **My customers** and can receive, start and finish their own customers.
- **Booking statuses are unchanged** (CONFIRMED → CHECKED_IN → COMPLETED). The journey stage (`CheckIn.stage`) adds detail inside CHECKED_IN.
  - The calendar's Check in / Start / Complete buttons move the stage too, so either screen works.
  - Every step is written to `VisitEvent` with who did it. The appointment page shows this as a **Visit timeline**.
- **Consultation step:** added automatically for a first visit, or when the service has **Starts with a consultation** ticked (Catalog → Services → service → Visit journey). The migration ticked it for diagnostic services.
- **Pay before treatment:** tick **Paid before treatment** on the service. Unpaid customers can't go into the room.
  - Front desk can **Let in without payment**. This needs a reason, and the reason is saved on the visit timeline.
  - Everything else is paid at checkout, as before.
- **Arrival alert:** when a customer is checked in, her specialist gets a soft chime and an in-app message.
  - If they allowed notifications ("Turn on arrival alerts" on the board), they also get a browser/phone notification.
  - Nothing is sent outside the system.
- **Thresholds:** Settings → Visit journey. Waiting turns amber at 10 min and red at 20 min. Checkout is flagged at 10 min. Rooms show "being prepared" for 10 min after a session unless marked Ready. You can also turn the prayer-time chip on or off.
- **Prayer times:** computed offline for Riyadh (Umm al-Qura method, `src/modules/booking/prayer.ts`). Change the coordinates there if the clinic moves city.
- **Report:** Reports → **Visit flow** shows average/longest wait, % received on time, treatment overrun, time at checkout and visit length, per specialist. It can be exported as CSV.
- **Two people tapping at once:** the second tap gets "Someone else just updated this visit — refresh and try again." and nothing is applied twice.
- **Tests:** `tests/booking/journey.test.ts` (rules, gate, races, metrics) and `e2e/admin-visits.spec.ts` (a full visit on the board in English and Arabic).

### 3.10 Commission, specialist discounts and roles

Full design: `docs/PRD-commission-discounts-roles.md`.

**Commission** (code in `src/modules/hr/commission.ts`):
- **Rates:**
  - HR file → **Services commission %** and **Products commission %**.
  - A service can have its own rate (Catalog → Services → service → Visit journey). Only people with HR access see this field.
- **What counts:**
  - Service and product lines on invoices **paid in full**, in the month of the last payment.
  - The amount is **after discounts, excluding VAT**.
  - The part paid with a package session is skipped. The session itself counts when it's used, at package price ÷ sessions.
  - Credit notes take commission back.
  - Gift cards and memberships never earn commission.
- **Who it counts for:** each invoice line has **Done by / Sold by**.
  - On a booking's invoice it is filled automatically with the specialist.
  - On walk-in sales, front desk picks who sold the product.
  - "No one" means no commission.
- **Where it shows:**
  - Payroll drafts.
  - Reports → Staff performance. The commission column is visible only with HR access.
  - Each person's **My time & leave → My commission**: this month so far, line by line, plus last month.
- **Past payslips:** approved and paid ones are never changed. Recalculating a **draft** run uses the new rules.

**Specialist discounts** (code in `src/modules/booking/discounts.ts`):
- **Where:** on the visit board, or the appointment page, from consultation until the invoice is issued. She picks a % or SAR amount and a reason.
- **Within her limit** it applies at once:
  - Default limit **10%** (Settings → Discounts). An optional SAR maximum can be set too.
  - A person's own limit can be set in her HR file.
- **Above the limit** it waits for someone with "Approve discounts" (Manager, Admin, Owner).
  - The request appears in their notifications and on the board, with Approve / Decline.
- **On the invoice:** an applied discount pre-fills the invoice line when front desk opens checkout. If the draft was already open, the draft is updated.
- **After issuing:** discounts lock to the invoice. Anything still waiting is declined. After that, use a credit note.
- **Audit:** every discount (who, how much, why, approved by) is in Reports → **Discounts** and on the visit timeline. Issuing an invoice writes its discounts to the audit log.
- **Loyalty tier discount** (Loyalty tiers → discount %) now applies automatically to service lines when the customer has no paid membership.

**Roles** (matrix in `src/modules/iam/permissions.ts`; the live roles were updated by migration `20261017100000_role_matrix`, with before → after in the audit log):

| Role | What they can do |
|---|---|
| Specialist | Her visits, calendar (view), customers, patient file (including allergies and skin type), notes, consent forms, discounts up to her limit, her own commission. No billing, leads, reports or prices. |
| Reception | Bookings, check-in/out, customers, notes, billing, gift cards and package sales, consent signing at the desk (form only, no medical history). |
| Manager | All operations plus **services & prices**, approving discounts, users and roles. Not HR, settings or the website. |
| Marketing | Website, blog, media, inquiries, reviews, campaigns. **No longer edits services or prices.** |
| Sales / Telesales | As before, plus notes. |

- **No escalation:** in Users / Roles you can only add or remove permissions you hold yourself. You also can't delete someone with more access than you.
- **Packages:** gift cards and package sales need Billing. *Creating or pricing* a package needs Catalog (Manager).
- **Tests:**
  - `tests/iam/roleMatrix.test.ts`, `tests/hr/commission.test.ts`, `tests/booking/discounts.test.ts`.
  - `e2e/admin-commission-discounts.spec.ts`: a specialist gives a discount, a manager approves, she sees her commission; the specialist's menu matches the role.

## 4. Backup

**Automatic (since 2026-10-14):** the deploy workflow installs
`/etc/cron.d/lunia-backup`, which runs `deploy/scripts/backup.sh` every night at
about 02:15 Riyadh time and logs to `/var/log/lunia-backup.log` (rotated weekly).
Every deploy also takes a backup **before** running migrations.

Each run:

1. Writes a gzip'd `pg_dump` (`backups/db-<timestamp>.sql.gz`) and a tar of the
   uploaded media (`backups/media-<timestamp>.tgz`, streamed from the running app
   container). Local copies older than `RETAIN_DAYS` (default 14) are pruned.
2. If off-site storage is configured, encrypts each file (AES-256,
   `BACKUP_ENCRYPTION_KEY`) and uploads it to the S3-compatible bucket under
   `lunia/`. Off-site copies older than 30 days are deleted.
3. Records the outcome as JobRun `backup`. **Settings → Automations** shows the
   last run, with a warning if it failed, was local-only, or is more than 36 hours old.

### 4.1 Off-site storage setup (one-time, owner)

1. Create a bucket in Cloudflare R2, Backblaze B2 or AWS S3. Use an access key
   that can **only** read and write that bucket.
2. Generate an encryption key, e.g. `openssl rand -base64 32`. **Store it in the
   owner's password manager.** Without it, backups cannot be decrypted.
3. Add these GitHub Actions secrets (repo → Settings → Secrets → Actions):

| Secret | Example |
|---|---|
| `BACKUP_S3_ENDPOINT` | `https://<account>.r2.cloudflarestorage.com` |
| `BACKUP_S3_BUCKET` | `lunia-backups` |
| `BACKUP_S3_REGION` | optional; `auto` for R2 |
| `BACKUP_S3_ACCESS_KEY_ID` | bucket-scoped key id |
| `BACKUP_S3_SECRET_ACCESS_KEY` | its secret |
| `BACKUP_ENCRYPTION_KEY` | the key from step 2 |

4. Re-run the latest deploy (Actions → Deploy → Re-run). It writes
   `/etc/lunia/backup.env` (root-only) and takes a backup straight away. Check
   Settings → Automations for "copied off-site (encrypted)".

Manual run, from the repo root on the VPS: `sudo bash deploy/scripts/backup.sh`.

Media is stored on the `uploads` Docker volume (mounted at `/app/uploads`),
which persists across container rebuilds. Do not rely on the container
filesystem for it.

## 5. Restore

From an off-site copy, first fetch and decrypt it. Nothing is restored by this step:

```bash
sudo bash deploy/scripts/fetch-offsite-backup.sh                          # list
sudo bash deploy/scripts/fetch-offsite-backup.sh db-20261015-021500.sql.gz
```

The decrypted file lands in `backups/`. Then continue below.

Database:

```bash
./deploy/scripts/restore.sh backups/db-20260907-120000.sql.gz
```

This is destructive — it overwrites the target database — and asks for a
typed `yes` confirmation before running. Take a fresh `backup.sh` snapshot
of the current state first if it has any value. If the dump predates recent
schema migrations, run `prisma migrate deploy` via the `migrate` service
(section 3) afterwards.

Media (restore a `media-*.tgz` into the uploads volume):

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -v "$(pwd)/backups:/backup" --entrypoint sh app \
  -c "tar xzf /backup/media-20260907-120000.tgz -C /app/uploads"
```

### 5.1 Restore drill (run quarterly)

Prove the backups actually restore, on a NON-production host or a scratch
database:

1. Copy a recent `db-*.sql.gz` + `media-*.tgz` pair to a scratch checkout.
2. Bring up a throwaway stack (`docker compose -f docker-compose.prod.yml up -d postgres redis`).
3. Run `restore.sh` against the scratch DB, then the media restore command above.
4. Start `app`, sign in, and confirm recent bookings/clients and at least one
   uploaded image render correctly.
5. Record the drill date and outcome. Tear the scratch stack down.

## 5.2 Health checks

The `app` service has a Docker `healthcheck` that polls `/api/health`; `nginx`
now waits for `app` to be **healthy** (`condition: service_healthy`) before
starting, so traffic is never proxied to an app that has not finished booting.
Check status with `docker compose -f docker-compose.prod.yml ps` (look for
`healthy` on `app`).

## 6. Rotating secrets

- **`SESSION_SECRET`**: rotating it invalidates every existing session
  (users are logged out). Generate a new value with
  `openssl rand -base64 48`, update `.env.prod`, then
  `docker compose -f docker-compose.prod.yml up -d app` to pick it up.
- **`POSTGRES_PASSWORD`**: update it inside the running Postgres
  (`ALTER USER lunia WITH PASSWORD '...'`), update `.env.prod`'s
  `POSTGRES_PASSWORD` and the password embedded in `DATABASE_URL` to match,
  then restart `app`.
- **Seed owner password** (`SEED_OWNER_PASSWORD`): only used the first time
  the seed script creates the owner account. Change the account's password
  through the app itself afterwards; updating `.env.prod` after first boot
  has no effect on an already-seeded user.

## 7. VPS hardening — do this before or immediately after first boot

The VPS this stack lands on is assumed to start from a fresh provider image
with a root password set at provisioning time. Before this goes anywhere
near real traffic or data:

1. **Rotate the root password** issued by the VPS provider — it was likely
   emailed or displayed in a dashboard and should be treated as already
   compromised.
2. **Switch to SSH key authentication** and disable password auth entirely:
   add your public key to `~/.ssh/authorized_keys`, then in
   `/etc/ssh/sshd_config` set `PasswordAuthentication no` and
   `PermitRootLogin prohibit-password` (or create a non-root deploy user and
   set `PermitRootLogin no`), then `systemctl restart sshd`.
3. Consider a basic firewall (ufw/iptables) allowing only 22, 80, 443.

This step is a prerequisite for the live deploy, not something this build
task performs — it requires hands-on access to the actual VPS.

## 8. Communications (WhatsApp / SMS)

Stage 6 adds booking confirmations, 24h reminders, post-visit follow-ups
(all via `worker/index.ts` polling `processDueMessages()`), and client OTP
login SMS (`src/modules/iam/clientAuth.ts`). **Out of the box — local dev,
CI, and any deploy that hasn't set `COMMS_PROVIDER` — none of this sends a
real message.** Every send attempt is instead logged via `stubSender`
(`src/modules/booking/outbox.ts`) and still recorded in `CommunicationLog`,
so the full pipeline (scheduling, rendering, status flips, audit log) is
exercised end-to-end without ever touching a real provider or costing money.

### 8.1 Enabling a real provider

Real sends require **both**:

1. `NODE_ENV=production`, and
2. the selected provider's full credential set present in the environment.

`getConfiguredSender()` / `getSmsSender()` (`src/modules/comms/sender.ts`)
fall back to the logging-only stub whenever either condition isn't met —
this is a deliberate safety rail, not a bug, so don't "fix" it by relaxing
the check.

Set `COMMS_PROVIDER` to one of `meta_whatsapp` | `twilio` | `unifonic`, plus
`COMMS_FROM` and that provider's credentials (exact env var names, from
`src/modules/comms/config.ts`):

| Provider | `COMMS_PROVIDER` | Required env vars |
|---|---|---|
| Meta WhatsApp Cloud API | `meta_whatsapp` | `META_WA_TOKEN`, `META_WA_PHONE_ID` |
| Twilio (SMS or WhatsApp) | `twilio` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| Unifonic (SMS) | `unifonic` | `UNIFONIC_APP_SID`, `UNIFONIC_SENDER_ID` |

`COMMS_FROM` is read by `getCommsConfig()` for all providers but is only
strictly required for Twilio (`TWILIO_FROM` is what Twilio's adapter
actually sends from); keep it set regardless for consistency. All of the
above are optional env vars — they are validated by `getCommsConfig()`
(never by the strict `src/lib/env.ts` schema), so leaving them unset never
fails a build or a non-comms deploy. See `.env.example` for the full list
with inline comments.

Add these to `.env.prod` on the VPS (see section 1) and restart the `app`
and `worker` services to pick them up:

```bash
docker compose -f docker-compose.prod.yml up -d app worker
```

### 8.2 WhatsApp go-live prerequisite — READ BEFORE ENABLING `meta_whatsapp`

**Meta's WhatsApp Cloud API does not allow free-form business-initiated
messages.** Booking confirmations, 24h reminders, and post-visit
follow-ups are all *business-initiated* (the client didn't just message us),
so Meta requires they go out as **pre-approved message templates** — plain
text is rejected outside a 24-hour customer-service window (i.e. only after
the customer themselves messaged the business number recently, which does
not apply to any of these three message kinds).

Until all four of the following are done, `meta_whatsapp` sends for
CONFIRMATION / REMINDER_24H / POST_VISIT **will fail** (recorded as
`FAILED` in the comms log, never a crash — see 8.4):

1. **WhatsApp Business API verification** — the client must complete Meta's
   business verification for their WhatsApp Business Account.
2. **Create and get approval for message templates** in Meta Business
   Manager matching our copy (see the bilingual templates editable at
   `/admin/comms/templates` for the current en/ar wording per kind).
   Approval can take from minutes to a few days and is entirely on Meta's
   side.
3. **Set `providerTemplateName`** on each approved `MessageTemplate` row (via
   `/admin/comms/templates`) to the exact template name Meta approved. This
   field already exists on the model and is read by `renderTemplate()`
   (`src/modules/comms/templates.ts`), but nothing sends it yet — see next.
4. **Complete the Meta adapter's template-send path.** The current
   `makeMetaSender()` (`src/modules/comms/providers/meta.ts`) only sends
   plain `type: "text"` messages — there's a documented `TODO` in that file
   marking where a `{type: "template", template: {name, ...}}` request body
   (using `providerTemplateName` and positional params) needs to be built
   instead. This is required engineering work, not just configuration.

**Until all four are done, do not set `COMMS_PROVIDER=meta_whatsapp` in
production** — sends will simply fail (logged, not silently dropped, but no
message reaches the client). **SMS via Twilio or Unifonic has no such
template restriction** — plain-text SMS sends immediately once that
provider's credentials are set and `NODE_ENV=production`. If WhatsApp
approval is still pending, SMS is the deployable option for booking
messages and OTP today.

### 8.3 Message templates

Bilingual (ar/en) message templates are editable at `/admin/comms/templates`
(`src/app/admin/comms/templates/`). Each row is keyed by (kind, locale,
channel) — kind is one of `CONFIRMATION`, `REMINDER_24H`, `POST_VISIT`,
`OTP`; channel is `whatsapp` or `sms`. Body text uses `{{placeholder}}`
tokens (e.g. `{{serviceName}}`, `{{dateTime}}`) interpolated at send time by
`renderTemplate()`. If no active template row exists for a given
kind/locale/channel, rendering falls back (same-kind other channel, then
English, then a built-in default) — see that function's comment for the
exact order — so the pipeline never fails to produce a body.

Provider status and the full send log (every attempt, success or failure)
are visible at `/admin/comms`. The provider-status panel shows only
**which** credentials are present (`Yes`/`No`), never their values — see
`CredentialRow` in `src/app/admin/comms/page.tsx`.

### 8.4 Client OTP (phone login)

`requestOtp()` (`src/modules/iam/clientAuth.ts`) sends the OTP code via SMS
through `getSmsSender()` — the same production+configured gate as above,
restricted to the two SMS-capable providers (`twilio`, `unifonic`;
`meta_whatsapp` is WhatsApp-only and is never selected for OTP). In any
non-production environment (dev, test, CI, or a deploy without an SMS
provider configured), `requestOtp()` returns `{ devCode }` — the code
in-band, for local testing — instead of relying on an actual SMS. In
production it returns `{}` and the user must read the code off their phone.

### 8.5 Failure handling

A provider outage never takes down the worker or the OTP flow:

- `processDueMessages()` (`src/modules/booking/outbox.ts`) catches both a
  `{ok: false}` result and a thrown/rejected `sender.send()` per message,
  marks that `ScheduledMessage` `FAILED`, writes a `CommunicationLog` row
  for it, and moves on to the next message in the batch.
- `worker/index.ts`'s poll loop (`tick()`) additionally wraps the whole
  `processDueMessages()` call, so even an unexpected throw there just logs
  and waits for the next 30s tick rather than killing the process.
- `requestOtp()`'s `sendOtpSms()` swallows template-render, sender, and
  log-write errors independently — a comms outage never blocks OTP issuance,
  since the code is already stored in Redis regardless of whether the SMS
  (or its log row) went out.

**Automatic retry (2026-10-14):** a FAILED message is put back to PENDING by
`requeueFailedMessages()` (called every worker tick) after 10 min × attempts,
up to `MAX_SEND_ATTEMPTS` = 3 in total, and only while its original `sendAt`
is less than 6 hours old (a reminder hours late is worse than none). A message
with no recipient is never retried. `ScheduledMessage.attempts` / `failedAt`
show the history.

Every attempt — success or failure, WhatsApp/SMS/OTP — is recorded in
`CommunicationLog`, visible at `/admin/comms`.

## Follow-ups (not in this stage)

- Service-access rules and the full catalog, CMS/media/settings UI are out
  of scope for this stage (see the Foundation plan's self-review).
- **Inbound message handling / two-way chat**, **marketing broadcast
  campaigns**, and **delivery-receipt webhooks** are out of scope for Stage
  6 (see that stage's self-review) — a possible later enhancement.
