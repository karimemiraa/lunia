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

Writes a gzip'd `pg_dump` to `backups/db-<timestamp>.sql.gz` (the `backups/`
directory is git-ignored — copy dumps off the VPS to real backup storage,
this is not itself an offsite backup solution). Run this on a cron schedule
in addition to before every deploy, e.g. nightly:

```
0 2 * * * cd /path/to/lunia && ./deploy/scripts/backup.sh >> /var/log/lunia-backup.log 2>&1
```

## 5. Restore

```bash
./deploy/scripts/restore.sh backups/db-20260907-120000.sql.gz
```

This is destructive — it overwrites the target database — and asks for a
typed `yes` confirmation before running. Take a fresh `backup.sh` snapshot
of the current state first if it has any value.

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

## Follow-ups (not in this stage)

- **`worker` service**: `docker-compose.prod.yml` has no BullMQ worker yet —
  the app doesn't have any queues wired up at this point in the build. When
  the Booking stage introduces reminder jobs, add a `worker` service reusing
  this same image with an alternate CMD (e.g. `node worker.js`), the same
  `env_file`, and `depends_on: [postgres, redis]`.
- Service-access rules and the full catalog, CMS/media/settings UI, and
  client OTP login are out of scope for this stage (see the Foundation
  plan's self-review).
