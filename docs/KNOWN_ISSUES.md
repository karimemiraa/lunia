# Known Issues

## 1. Production build (`next build`) fails at static prerender of `/_global-error` — BLOCKS DEPLOY

**Status:** Open · **Priority:** High (blocks production deploy) · **Introduced:** Pre-existing (fails on `main` before and after the engagement stage)

### Symptom
`pnpm build` compiles successfully, then fails during static page generation:

```
Error occurred prerendering page "/_global-error".
TypeError: Cannot read properties of null (reading 'useContext')
    at ignore-listed frames { digest: '3849081143' }
Export encountered an error on /_global-error/page: /_global-error, exiting the build.
```

Accompanied by a flood of `Each child in a list should have a unique "key" prop` warnings on Next-internal boundaries (`<meta>`, `<head>`, `<__next_viewport_boundary__>`). Auth-gated `/admin/*` pages report the same `useContext` null (and `/admin` a `Cannot read properties of undefined (reading 'length')`) as knock-on failures.

### What it is NOT
- **Not** caused by the engagement stage — `git checkout main` (before the merge) builds with the identical error.
- **Not** `node_modules`/pnpm-store corruption — `pnpm install` reports "Already up to date"; `tsc`, 452 unit tests, and 86 e2e all pass.
- **Not** userland-fixable via a custom `global-error.tsx` — the crash persists on Next's synthetic `/_global-error` page even with one present.
- **Not** a runtime problem — `next dev` works fine; the app runs and the full e2e suite (against the dev server) is green.

### Diagnosis
Framework-level. `useContext` returning null in Next's built-in error-page prerender points to a React dispatcher/version incompatibility in **static export** under **Next 16.3.4 + React 19.2.8**. It surfaces only in the production static-generation path.

### Partial mitigation found
Adding `export const dynamic = "force-dynamic"` to `src/app/admin/layout.tsx` removes the `/admin/*` prerender errors (correct anyway — every admin page is auth-gated/per-request via `requireAdmin`, which reads the session cookie, so the segment should never be statically prerendered). This does **not** fix the fatal `/_global-error` crash, so it was not committed on its own; fold it into the real fix.

### Suggested next steps (deliberate, human-gated — touches framework deps)
1. Align React/`react-dom` to the version Next 16.3.4 expects (or move Next to a version compatible with React 19.2.8); rebuild.
2. If a version bump is undesirable, investigate an experimental config to opt the error page out of static export.
3. After a fix: add `force-dynamic` to the admin layout, and add `pnpm build` to CI so this can't regress silently (today only `tsc`/unit/e2e run, and e2e uses `next dev`).
