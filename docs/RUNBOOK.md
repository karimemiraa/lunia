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

## 4. Backup

```bash
./deploy/scripts/backup.sh
```

Writes two files under `backups/` (git-ignored): a gzip'd `pg_dump`
(`db-<timestamp>.sql.gz`) AND a tar of the uploaded-media volume
(`media-<timestamp>.tgz`). Local copies older than `RETAIN_DAYS` (default 14)
are pruned. This is **not** an offsite solution — copy `backups/` off the VPS
to real backup storage. Run nightly via cron, and also before every deploy:

```
0 2 * * * cd /path/to/lunia && ./deploy/scripts/backup.sh >> /var/log/lunia-backup.log 2>&1
# then ship the new files offsite, e.g.:
15 2 * * * rsync -az /path/to/lunia/backups/ user@offsite:/lunia-backups/ >> /var/log/lunia-offsite.log 2>&1
```

Media is stored on the `uploads` Docker volume (mounted at `/app/uploads`),
which persists across container rebuilds — do not rely on the container
filesystem for it.

## 5. Restore

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

Every attempt — success or failure, WhatsApp/SMS/OTP — is recorded in
`CommunicationLog`, visible at `/admin/comms`.

## Follow-ups (not in this stage)

- Service-access rules and the full catalog, CMS/media/settings UI are out
  of scope for this stage (see the Foundation plan's self-review).
- **Inbound message handling / two-way chat**, **marketing broadcast
  campaigns**, and **delivery-receipt webhooks** are out of scope for Stage
  6 (see that stage's self-review) — a possible later enhancement.
