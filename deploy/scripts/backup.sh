#!/usr/bin/env bash
# Dumps the production Postgres database to a gzip file under backups/.
# Run from the repo root on the VPS: ./deploy/scripts/backup.sh
set -euo pipefail

cd "$(dirname "$0")/../.."

# Pick up POSTGRES_USER / POSTGRES_DB from .env.prod if present, so this
# matches whatever the postgres container was actually configured with.
if [ -f .env.prod ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.prod
  set +a
fi

mkdir -p backups

STAMP=$(date +%Y%m%d-%H%M%S)
DB_USER="${POSTGRES_USER:-lunia}"
DB_NAME="${POSTGRES_DB:-lunia}"

docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip > "backups/db-$STAMP.sql.gz"

echo "backup written: backups/db-$STAMP.sql.gz"
