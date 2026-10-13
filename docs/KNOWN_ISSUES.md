# Known Issues

## 1. Production build — RESOLVED (was: `/_global-error` prerender crash)

**Status:** ✅ Resolved (2026-09-12) · The production Docker build succeeds end-to-end and the image runs.

### What was happening
`pnpm build` failed during static export with `TypeError: Cannot read properties of null (reading 'useContext')` on Next's built-in `/_global-error` page (and, before that, on statically-exported content pages).

### Root cause (two separate things)
1. **DB-backed pages were statically exported at build time.** The `[slug]` pages had `generateStaticParams` that query Postgres, and the `(site)` pages read CMS/catalog data during render — so `next build` needed a live database and froze content at build time. Wrong model for a CMS-driven site.
2. **A local-only static-export crash.** On **local macOS + Node 20**, Next's static-export worker rendered `/_global-error` (and other statically-exported pages) with React resolving to `null` inside Next's internal `LayoutRouter` → the `useContext` crash. This is **environment-specific**: it does **not** reproduce in the production build (**Node 22 / Linux**, as pinned in the Dockerfile), and `next dev` is unaffected.

Verified independent of: Next version (16.3.4 / 16.3.5 / 16.4 canary), React version (19.1.9 / 19.2.8 / 19.3.0), next-intl, `output: standalone`, Turbopack vs webpack, root-layout structure, and a clean reinstall.

### The fix (commit on `main`)
Render the site **dynamically** — correct for a DB-backed CMS: content is always fresh, there is no build-time DB dependency, and nothing is statically exported (which also sidesteps the local macOS quirk).
- `src/app/[locale]/(site)/layout.tsx` → `export const dynamic = "force-dynamic"`
- `src/app/admin/layout.tsx` → `export const dynamic = "force-dynamic"` (auth-gated, per-request anyway)
- Removed `generateStaticParams` from `brands/[slug]`, `services/[slug]`, `journal/[slug]` (they now render on demand).

SEO is preserved: dynamic SSR still serves full HTML with metadata + JSON-LD, and `sitemap.ts` / `robots.ts` / hreflang are unaffected.

### Verification
- ✅ `docker build .` (Node 22 / Linux — the real deploy build) completes; full image runs: `/api/health` 200, `/` 307→`/ar`, `/ar` 200.
- ✅ tsc clean · 452 unit tests · 86 e2e.

### Notes for developers
- **Local `next build` on macOS/Node 20 still hits the `/_global-error` quirk** — use `next dev` for local work, and the **Docker build** to produce/verify a production build. Consider moving local dev to Node 22 to match production.
- ✅ (2026-10-13) CI now has a `verify` job (typecheck, lint, full unit/integration suite on fresh Postgres 16 + Redis) that the deploy job depends on; the production Docker build itself runs in the deploy job. e2e still runs locally only (`next dev`).
- Dockerfile line 66 sets a **dummy** build-time `SESSION_SECRET` (the `SecretsUsedInArgOrEnv` warning) — the real secret is injected at runtime via compose; the dummy is only to let `next build` run.

## 2. Local dev: restart `next dev` after a Prisma schema change

**Status:** ⚠️ Developer gotcha (not a production issue)

After `prisma migrate deploy` + `prisma generate`, an already-running `next dev`
keeps the OLD Prisma client in memory: new tables/columns fail with
`Unknown argument …` or `Cannot read properties of undefined (reading 'findMany')`.
Restart `next dev`. If public pages then 404 after a local `next build`, delete
`.next/dev` and restart. Production is unaffected (fresh image per deploy).

## 3. Open decisions from the October 2026 safety audit

**Status:** ⏳ Waiting on the owner — nothing changed yet

- **Database backups aren't scheduled.** `deploy/scripts/backup.sh` exists but no cron/systemd timer runs it on the VPS. Needs a decision on schedule and off-site destination (RUNBOOK §4).
- **Content-Security-Policy allows `'unsafe-inline'` scripts.** Moving to nonces is doable but touches every page render; worth a dedicated change.
- **Public invoice links never expire.** Anyone with the link can view the invoice (name, phone, amounts). Options: expire after N days, or require the phone's last 4 digits.
- **Moyasar webhook token check** is skipped when the secret isn't set. Low risk because the payment status is always re-fetched from Moyasar, but set `PAYMENT_WEBHOOK_SECRET` in production.
- **Gift cards sold online before 2026-10-14** may have been issued without a real payment (stub charge). Check `GiftCardOrder` rows with `paymentRef` starting `stub-` in production.
