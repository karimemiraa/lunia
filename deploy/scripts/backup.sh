#!/usr/bin/env bash
# Backs up the production stack: a gzip'd pg_dump of the database AND a tar of
# the uploaded-media volume. Prunes local copies older than RETAIN_DAYS.
# Run from the repo root on the VPS: ./deploy/scripts/backup.sh
#
# Off-site: when BACKUP_S3_BUCKET is set (installed by the deploy workflow in
# /etc/lunia/backup.env), each file is encrypted with AES-256 using
# BACKUP_ENCRYPTION_KEY and uploaded to that S3-compatible bucket (Cloudflare
# R2, Backblaze B2, AWS S3) under lunia/. Off-site copies older than
# OFFSITE_RETAIN_DAYS are deleted. Without the key a backup CANNOT be
# restored — keep it in the owner's password manager too.
#
# Every run records its outcome as a JobRun row (job "backup") so Settings →
# Automations shows whether last night's backup worked. Nightly cron is
# installed by the deploy workflow (/etc/cron.d/lunia-backup).
set -euo pipefail

cd "$(dirname "$0")/../.."

RETAIN_DAYS="${RETAIN_DAYS:-14}"
OFFSITE_RETAIN_DAYS="${OFFSITE_RETAIN_DAYS:-30}"
AWS_CLI_IMAGE="amazon/aws-cli:2.17.0"

# Pick up POSTGRES_USER / POSTGRES_DB from .env.prod if present, so this
# matches whatever the postgres container was actually configured with.
if [ -f .env.prod ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.prod
  set +a
fi
# Off-site settings (root-only file written by the deploy workflow).
if [ -r /etc/lunia/backup.env ]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/lunia/backup.env
  set +a
fi

COMPOSE=(docker compose -f docker-compose.prod.yml)
DB_USER="${POSTGRES_USER:-lunia}"
DB_NAME="${POSTGRES_DB:-lunia}"
STAMP=$(date +%Y%m%d-%H%M%S)
RUN_DAY=$(TZ=Asia/Riyadh date +%Y-%m-%d)

record_status() { # ok(true|false) summary
  local summary=${2//\'/\'\'}
  "${COMPOSE[@]}" exec -T postgres psql -q -U "$DB_USER" -d "$DB_NAME" -c \
    "INSERT INTO \"JobRun\" (id, job, \"runKey\", \"startedAt\", \"finishedAt\", ok, summary)
     VALUES (md5(random()::text || clock_timestamp()::text), 'backup', '$RUN_DAY', now(), now(), $1, '$summary')
     ON CONFLICT (job, \"runKey\") DO UPDATE SET \"startedAt\" = now(), \"finishedAt\" = now(), ok = EXCLUDED.ok, summary = EXCLUDED.summary;" \
    >/dev/null 2>&1 || echo "WARNING: could not record backup status" >&2
}
trap 'record_status false "Backup failed at line $LINENO, see /var/log/lunia-backup.log on the server"' ERR

mkdir -p backups

"${COMPOSE[@]}" exec -T postgres pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "backups/db-$STAMP.sql.gz"
# An empty/tiny dump means pg_dump failed silently behind the pipe.
if [ "$(stat -c %s "backups/db-$STAMP.sql.gz")" -lt 1024 ]; then
  echo "ERROR: database dump is suspiciously small" >&2
  false
fi
echo "backup written: backups/db-$STAMP.sql.gz"
FILES=("db-$STAMP.sql.gz")

# Uploaded media lives on the `uploads` named volume (mounted at /app/uploads
# in the app service). Stream a tar out of the RUNNING app container: no image
# or volume name to resolve, so it works the same from cron and from a deploy.
if "${COMPOSE[@]}" exec -T app tar czf - -C /app/uploads . > "backups/media-$STAMP.tgz" 2>/dev/null \
  && [ "$(stat -c %s "backups/media-$STAMP.tgz")" -gt 0 ]; then
  echo "backup written: backups/media-$STAMP.tgz"
  FILES+=("media-$STAMP.tgz")
else
  echo "WARNING: media archive failed (app not running, or no uploads yet?); skipping media for $STAMP" >&2
  rm -f "backups/media-$STAMP.tgz"
  MEDIA_NOTE=", media SKIPPED"
fi

SIZE=$(du -ch "${FILES[@]/#/backups/}" | tail -1 | cut -f1)

aws_s3() {
  docker run --rm -e AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" -e AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
    -e AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-auto}" -v "$(pwd)/backups:/backups" \
    "$AWS_CLI_IMAGE" --endpoint-url "$BACKUP_S3_ENDPOINT" "$@"
}

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo "ERROR: BACKUP_S3_BUCKET is set but BACKUP_ENCRYPTION_KEY is not; refusing to upload unencrypted backups" >&2
    false
  fi
  for f in "${FILES[@]}"; do
    openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_ENCRYPTION_KEY -in "backups/$f" -out "backups/$f.enc"
    aws_s3 s3 cp "/backups/$f.enc" "s3://$BACKUP_S3_BUCKET/lunia/$f.enc" --only-show-errors
    rm -f "backups/$f.enc"
    echo "copied off-site: s3://$BACKUP_S3_BUCKET/lunia/$f.enc"
  done
  CUTOFF=$(date -u -d "$OFFSITE_RETAIN_DAYS days ago" +%Y-%m-%dT%H:%M:%S)
  OLD=$(aws_s3 s3api list-objects-v2 --bucket "$BACKUP_S3_BUCKET" --prefix lunia/ \
    --query "Contents[?LastModified<='$CUTOFF'].Key" --output text)
  for key in $OLD; do
    [ "$key" = "None" ] && continue
    aws_s3 s3 rm "s3://$BACKUP_S3_BUCKET/$key" --only-show-errors
  done
  WHERE="copied off-site (encrypted)"
else
  WHERE="LOCAL ONLY on the server (off-site storage not configured)"
  echo "WARNING: off-site storage not configured; this backup only exists on this server." >&2
fi

# Prune old local copies (off-site copies are pruned above).
find backups -type f \( -name 'db-*.sql.gz' -o -name 'media-*.tgz' \) -mtime "+$RETAIN_DAYS" -delete
echo "pruned local backups older than $RETAIN_DAYS day(s)."

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  record_status true "${#FILES[@]} file(s), $SIZE, $WHERE${MEDIA_NOTE:-}"
else
  record_status false "${#FILES[@]} file(s), $SIZE, $WHERE${MEDIA_NOTE:-}"
fi
