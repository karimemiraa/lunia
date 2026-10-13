#!/usr/bin/env bash
# Lists or downloads + decrypts an off-site backup made by backup.sh.
# Run from the repo root on the VPS (or any machine with Docker, openssl and
# the same BACKUP_* variables exported):
#
#   ./deploy/scripts/fetch-offsite-backup.sh                         # list what's there
#   ./deploy/scripts/fetch-offsite-backup.sh db-20261015-021500.sql.gz
#
# The decrypted file lands in backups/, ready for restore.sh (database) or the
# media tar command in RUNBOOK §5. Nothing is restored automatically.
set -euo pipefail

cd "$(dirname "$0")/../.."
if [ -r /etc/lunia/backup.env ]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/lunia/backup.env
  set +a
fi
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET not set}" "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT not set}"
mkdir -p backups

aws_s3() {
  docker run --rm -e AWS_ACCESS_KEY_ID="$BACKUP_S3_ACCESS_KEY_ID" -e AWS_SECRET_ACCESS_KEY="$BACKUP_S3_SECRET_ACCESS_KEY" \
    -e AWS_DEFAULT_REGION="${BACKUP_S3_REGION:-auto}" -v "$(pwd)/backups:/backups" \
    amazon/aws-cli:2.17.0 --endpoint-url "$BACKUP_S3_ENDPOINT" "$@"
}

if [ $# -eq 0 ]; then
  aws_s3 s3 ls "s3://$BACKUP_S3_BUCKET/lunia/"
  exit 0
fi

: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY not set — without it the backup cannot be decrypted}"
NAME="${1%.enc}"
aws_s3 s3 cp "s3://$BACKUP_S3_BUCKET/lunia/$NAME.enc" "/backups/$NAME.enc" --only-show-errors
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -in "backups/$NAME.enc" -out "backups/$NAME"
rm -f "backups/$NAME.enc"
echo "decrypted: backups/$NAME"
