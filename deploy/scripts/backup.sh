#!/usr/bin/env bash
# Backs up the production stack: a gzip'd pg_dump of the database AND a tar of
# the uploaded-media volume. Prunes local copies older than RETAIN_DAYS.
# Run from the repo root on the VPS: ./deploy/scripts/backup.sh
#
# This writes locally only — copy backups/ OFFSITE (spec §10) via cron/rsync.
set -euo pipefail

cd "$(dirname "$0")/../.."

RETAIN_DAYS="${RETAIN_DAYS:-14}"

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

# Uploaded media lives on the `uploads` named volume (mounted at /app/uploads
# in the app service). Archive it through a throwaway app container so compose
# resolves the correct project-prefixed volume — no need to guess its name.
# --no-deps avoids starting postgres/redis just to tar files.
if docker compose -f docker-compose.prod.yml run --rm --no-deps \
  -v "$(pwd)/backups:/backup" \
  --entrypoint sh app \
  -c "tar czf /backup/media-$STAMP.tgz -C /app/uploads . 2>/dev/null"; then
  echo "backup written: backups/media-$STAMP.tgz"
else
  echo "WARNING: media archive failed (no uploads yet?); skipping media for $STAMP" >&2
  rm -f "backups/media-$STAMP.tgz"
fi

# Prune old local copies (offsite copies are managed separately).
find backups -type f \( -name 'db-*.sql.gz' -o -name 'media-*.tgz' \) -mtime "+$RETAIN_DAYS" -delete
echo "pruned local backups older than $RETAIN_DAYS day(s). REMINDER: copy backups/ offsite."
