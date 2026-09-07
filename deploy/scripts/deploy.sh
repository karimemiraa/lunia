#!/usr/bin/env bash
# Pulls the latest main, rebuilds the app image, runs pending migrations,
# and restarts the stack. Run from the repo root on the VPS.
#
# SCOPE NOTE: this script is written for the live VPS and is intentionally
# not run by the Foundation build task that introduced it — that task only
# builds the image locally (`docker build`). Do not run this against a
# remote host except as its own separate, approved deploy step.
set -euo pipefail

cd "$(dirname "$0")/../.."

if [ ! -f .env.prod ]; then
  echo ".env.prod not found — copy it into place before deploying (see docs/RUNBOOK.md)" >&2
  exit 1
fi

git pull --ff-only

docker compose -f docker-compose.prod.yml build app

# Migrations run against the dedicated `migrate` service (the `migrator`
# build target, which reuses the `build` stage's full node_modules), never
# against `app` — see docs/RUNBOOK.md.
docker compose -f docker-compose.prod.yml --profile tools run --rm migrate prisma migrate deploy

docker compose -f docker-compose.prod.yml up -d

echo "deployed"
