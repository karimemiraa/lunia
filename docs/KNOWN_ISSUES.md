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
- Add `docker build` (or a Node-22 `next build`) to CI so production-build regressions are caught — `next dev`-based e2e does not exercise the production build.
- Dockerfile line 66 sets a **dummy** build-time `SESSION_SECRET` (the `SecretsUsedInArgOrEnv` warning) — the real secret is injected at runtime via compose; the dummy is only to let `next build` run.
