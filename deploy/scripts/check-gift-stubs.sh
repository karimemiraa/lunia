#!/usr/bin/env bash
# Read-only: counts online gift card orders that were "paid" by the old stub
# charge (paymentRef starts with "stub-") — before 2026-10-14 production
# issued real cards for these without taking any money. Prints totals only,
# no names or codes. Run from the repo root on the VPS; the deploy workflow
# runs it on every deploy so the number shows up in the Actions log.
set -euo pipefail

cd "$(dirname "$0")/../.."
DB_USER=$(grep -E '^POSTGRES_USER=' .env.prod 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true)
DB_NAME=$(grep -E '^POSTGRES_DB=' .env.prod 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' || true)

docker compose -f docker-compose.prod.yml exec -T postgres psql -U "${DB_USER:-lunia}" -d "${DB_NAME:-lunia}" -tA -F ' | ' -c "
  SELECT
    'stub-paid orders: ' || count(*),
    'sold value SAR: ' || coalesce(sum(o.\"amountMinor\"), 0) / 100,
    'cards still usable: ' || count(c.id) FILTER (WHERE c.status = 'ACTIVE' AND c.\"balanceMinor\" > 0),
    'unspent balance SAR: ' || coalesce(sum(c.\"balanceMinor\") FILTER (WHERE c.status = 'ACTIVE'), 0) / 100
  FROM \"GiftCardOrder\" o
  LEFT JOIN \"GiftCard\" c ON c.id = o.\"giftCardId\"
  WHERE o.\"paymentRef\" LIKE 'stub-%';"
