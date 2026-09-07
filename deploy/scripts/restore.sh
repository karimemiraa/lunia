#!/usr/bin/env bash
# Restores a gzip'd pg_dump backup into the production database.
#
# DESTRUCTIVE: this overwrites data in the target database. Take a fresh
# backup.sh dump first if the current data is worth keeping.
#
# Usage: ./deploy/scripts/restore.sh backups/db-20260907-120000.sql.gz
set -euo pipefail

cd "$(dirname "$0")/../.."

if [ $# -ne 1 ]; then
  echo "usage: $0 <path-to-backup.sql.gz>" >&2
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [ -f .env.prod ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.prod
  set +a
fi

DB_USER="${POSTGRES_USER:-lunia}"
DB_NAME="${POSTGRES_DB:-lunia}"

read -r -p "This will overwrite the '$DB_NAME' database. Type 'yes' to continue: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "aborted"
  exit 1
fi

gunzip -c "$BACKUP_FILE" | docker compose -f docker-compose.prod.yml exec -T postgres psql -U "$DB_USER" "$DB_NAME"

echo "restore complete from: $BACKUP_FILE"
