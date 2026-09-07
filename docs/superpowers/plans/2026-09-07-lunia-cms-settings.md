# Lunia CMS & Settings — Implementation Plan (Stage 2 of 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** The admin control panel — everything editable from the panel: a media library, per-page editable content (hero media + section copy, bilingual), global site settings (NAP, hours, socials, SEO/hero defaults), and configuration UIs for roles/permissions and membership tiers. The public home is wired to read its content from the CMS to prove the loop.

**Architecture:** New `cms` module (media, page content, settings services) over Prisma; a pluggable storage interface with a local-filesystem implementation serving uploads via a route handler; extended `iam` services for role/permission and tier management; a real permission-gated admin shell with sidebar navigation and reusable admin UI components. All admin pages are server-guarded by permission.

**Tech Stack:** Existing repo stack — Next.js 16 (App Router), Prisma 7.10 (driver adapter via `@/lib/db`), next-intl, Tailwind v4 brand tokens, Redis sessions, Vitest + Playwright.

**Spec:** `docs/superpowers/specs/2026-09-07-lunia-platform-design.md` (§ CMS, Settings, flexibility layer).

## Global Constraints

- **Follow the established repo patterns — read these before implementing:** `src/lib/db.ts` (Prisma singleton + adapter), `src/modules/iam/{rbac,session,permissions}.ts` (auth + `getCurrentUser` + `PERMISSIONS`), `src/app/admin/page.tsx` (server guard pattern), `src/i18n/routing.ts`, `src/components/ui/{button,container}.tsx`, `prisma/schema.prisma` + `prisma/seed.ts` (Prisma 7 adapter + seed idempotency).
- **Every admin route/action is permission-gated server-side** using `getCurrentUser(cookie)` + a permission check; unauthorized → redirect to `/admin/login` (pages) or a 403 (actions/handlers). Use the existing `PERMISSIONS` keys: CMS_MANAGE (media, page content), SETTINGS_MANAGE (settings), STAFF_MANAGE (roles), and add tier management under SETTINGS_MANAGE.
- **Localized content** is stored as `{ en: string, ar: string }` JSON shapes; the admin edits both languages; the public site reads by locale.
- **Uploaded media** is stored under `uploads/` (already gitignored) via the storage interface — NEVER commit media files; served through a route handler, not committed to `public/`.
- **Admin UI language:** English-first (admin default locale), LTR. Admin does not need RTL for this stage.
- TypeScript strict, no `any` without justification; no emojis; conventional commits; TDD (write the failing test first); each task ends committed and green.
- Prisma migrations committed; run `pnpm db:migrate --name <n>` and `pnpm db:generate`. Seed remains idempotent.
- Reuse the Prisma 7 seed pattern (PrismaPg adapter + guarded `process.loadEnvFile()`) for any new seed code.

---

## File Structure

```
src/
├─ lib/storage.ts                         # storage interface + local FS impl
├─ modules/
│  ├─ cms/{media.ts,pageContent.ts,settings.ts}
│  └─ iam/{roles.ts,tiers.ts}             # admin management services
├─ app/
│  ├─ api/media/[...path]/route.ts        # serve uploaded media (auth-free read of public media)
│  └─ admin/
│     ├─ layout.tsx                        # real admin shell (nav) — replaces minimal shell
│     ├─ _components/{AdminNav.tsx,PageHeader.tsx,DataTable.tsx,Field.tsx,LocalizedField.tsx,requireAdmin.ts}
│     ├─ page.tsx                          # dashboard (existing, kept)
│     ├─ media/{page.tsx,actions.ts}
│     ├─ content/{page.tsx,[pageKey]/page.tsx,actions.ts}
│     ├─ settings/{page.tsx,actions.ts}
│     ├─ roles/{page.tsx,actions.ts}
│     └─ tiers/{page.tsx,actions.ts}
prisma/schema.prisma                       # + MediaAsset, PageContent
prisma/seed.ts                             # + default settings + default page content (home)
```

Each admin page is a server component that calls `requireAdmin(permission)` (redirects if unauthorized), then renders. Mutations are server actions that re-check the permission.

---

## Task 1: Storage interface + local FS implementation + media serve route

**Files:** Create `src/lib/storage.ts`, `src/app/api/media/[...path]/route.ts`, `tests/lib/storage.test.ts`.

**Interfaces (Produces):**
- `storage.put(key: string, data: Buffer, contentType: string): Promise<void>`
- `storage.get(key: string): Promise<{ data: Buffer; contentType: string } | null>`
- `storage.delete(key: string): Promise<void>`
- Local impl writes under `process.cwd()/uploads/<key>` and a sidecar `.meta` for contentType. Keys are sanitized (no `..`, no leading `/`).
- Route `GET /api/media/[...path]` streams the file for a given key (read is public — media on a public site is public).

- [ ] Write failing test: put a buffer, get it back with contentType, delete it, get returns null; a key containing `..` is rejected.
- [ ] Run, see fail.
- [ ] Implement storage.ts (fs/promises; ensure `uploads/` dir exists; sanitize keys; store contentType).
- [ ] Implement the serve route (reads via storage.get; 404 when null; sets Content-Type; caches).
- [ ] Run tests green. Commit `feat(cms): storage interface + local fs + media serve route`.

## Task 2: CMS data model (MediaAsset, PageContent) + migration

**Files:** Modify `prisma/schema.prisma`; create migration; `tests/cms/model.test.ts`.

**Models:**
- `MediaAsset` { id, kind (enum MediaKind IMAGE|VIDEO), storageKey (unique), filename, mimeType, sizeBytes Int, width Int?, height Int?, altEn String?, altAr String?, focalX Float @default(0.5), focalY Float @default(0.5), createdAt, uploadedById String? }
- `PageContent` { id, pageKey String @unique, data Json, updatedAt } — `data` holds `{ sections: [...] }` with localized text + mediaId references (shape validated in the service, not the DB).

- [ ] Add models; `pnpm db:migrate --name cms`; `pnpm db:generate`.
- [ ] Write a round-trip test (create a MediaAsset + PageContent, read back). Run green. Commit `feat(cms): media asset + page content schema`.

## Task 3: CMS services (media, pageContent) + Zod content schema

**Files:** Create `src/modules/cms/media.ts`, `src/modules/cms/pageContent.ts`, `tests/cms/services.test.ts`.

**Interfaces (Produces):**
- media: `createMedia(input): Promise<MediaAsset>`, `listMedia(): Promise<MediaAsset[]>`, `getMedia(id)`, `deleteMedia(id)` (also deletes from storage), `updateMediaAlt(id, {altEn, altAr})`.
- pageContent: a Zod schema for the page-content shape (`sections: { key, type, heroMediaId?, fields: Record<string,{en,ar}> }[]`); `getPageContent(pageKey): Promise<ParsedContent | null>`, `upsertPageContent(pageKey, content): Promise<void>` (validates with Zod).

- [ ] Write failing tests (create media via a fake storage put; parse valid/invalid page content; upsert + get round-trip).
- [ ] Implement services. Run green. Commit `feat(cms): media + page-content services`.

## Task 4: Settings service + seed defaults

**Files:** Create `src/modules/cms/settings.ts`, `tests/cms/settings.test.ts`; modify `prisma/seed.ts`.

**Interfaces (Produces):**
- A typed settings registry (Zod-validated) with keys: `business` ({ nameEn, nameAr, addressEn, addressAr, phone, whatsapp, email }), `hours` (per-day open/close), `social` ({ instagram, tiktok?, ... }), `seo` ({ defaultTitleEn/Ar, defaultDescEn/Ar }), `hero` ({ mediaId?, headlineEn/Ar, ctaEn/Ar }).
- `getSetting(key)`, `setSetting(key, value)` (validates against the registry), `getAllSettings()`.
- Seed default rows (idempotent upsert) with sensible Lunia defaults (Riyadh NAP placeholders, Instagram handle placeholder, hero headline "Where natural beauty begins"/"حيث يبدأ الجمال الطبيعي").

- [ ] Write failing tests (set/get a valid setting; reject invalid; getAll). Run fail → implement → green.
- [ ] Add seed defaults; run `pnpm db:seed` twice (idempotent). Commit `feat(cms): typed site settings + seed defaults`.

## Task 5: IAM management services (roles, tiers)

**Files:** Create `src/modules/iam/roles.ts`, `src/modules/iam/tiers.ts`, `tests/iam/manage.test.ts`.

**Interfaces (Produces):**
- roles: `listRolesWithPermissions()`, `createRole({key,name})`, `setRolePermissions(roleId, permissionKeys[])`, `deleteRole(roleId)` (block deleting isSystem roles). 
- tiers: `listTiers()`, `createTier(input)`, `updateTier(id, input)`, `deleteTier(id)` (block deleting isSystem tiers).

- [ ] Write failing tests (create a custom role, set its permissions, read back; cannot delete a system role; create/update a tier). Run fail → implement → green. Commit `feat(iam): role + tier management services`.

## Task 6: Admin shell + reusable admin components + requireAdmin guard

**Files:** Create `src/app/admin/_components/requireAdmin.ts`, `AdminNav.tsx`, `PageHeader.tsx`, `DataTable.tsx`, `Field.tsx`, `LocalizedField.tsx`; rewrite `src/app/admin/layout.tsx`; update `src/app/admin/page.tsx`; `tests/admin/requireAdmin.test.ts` + a component test.

**Interfaces (Produces):**
- `requireAdmin(permission?): Promise<{ id: string; permissions: Set<PermissionKey> }>` — reads the `lunia_session` cookie, calls `getCurrentUser`, `redirect("/admin/login")` if no user, and if a permission is passed and missing → redirect to `/admin` (or a 403 page). Used by every admin page.
- `AdminNav` renders sidebar links filtered by the current user's permissions (Dashboard always; Content/Media if CMS_MANAGE; Settings/Tiers if SETTINGS_MANAGE; Roles if STAFF_MANAGE).
- `PageHeader`, `DataTable` (generic list with a search box), `Field` (labeled input), `LocalizedField` (en+ar paired inputs).

- [ ] Write failing test for `requireAdmin` (no cookie → redirects; missing permission → redirects) using mocks/spies for cookies + getCurrentUser, and a render test for AdminNav filtering by permissions.
- [ ] Implement. The admin layout renders `<html lang="en" dir="ltr">` with the shell (nav + main). `admin/page.tsx` uses `requireAdmin()`.
- [ ] Run green; `pnpm build` ok. Commit `feat(admin): shell, nav, reusable components, requireAdmin guard`.

## Task 7: Media Library admin page

**Files:** Create `src/app/admin/media/page.tsx`, `src/app/admin/media/actions.ts`, `e2e/admin-media.spec.ts`.

- Page (guard CMS_MANAGE): upload form (file input → server action validates mime image/*|video/*, size cap e.g. 25MB, stores via storage + createMedia, extracts image dimensions), a searchable grid of media (thumbnail via `/api/media/<key>`, filename, alt), edit-alt inline, delete (with confirm).
- Actions re-check CMS_MANAGE.

- [ ] Write e2e: sign in as owner → go to /admin/media → upload a small test image → it appears in the grid → set alt text → delete it. 
- [ ] Implement page + actions. Run e2e green. Commit `feat(admin): media library page`.

## Task 8: Page Content editor

**Files:** Create `src/app/admin/content/page.tsx` (list of pages), `src/app/admin/content/[pageKey]/page.tsx` (editor), `src/app/admin/content/actions.ts`, `e2e/admin-content.spec.ts`.

- Content list: the editable pages (home first; about/services later stages). Editor (guard CMS_MANAGE): for the `home` page, edit the hero section — pick hero media from the library (mediaId), edit headline + CTA in EN and AR (LocalizedField), and the intro/section copy. Save via server action (validates via the Zod content schema, upsertPageContent).

- [ ] Write e2e: owner → /admin/content/home → change the hero headline (en+ar) → save → reload → value persisted.
- [ ] Implement. Run e2e green. Commit `feat(admin): page content editor`.

## Task 9: Settings page

**Files:** Create `src/app/admin/settings/page.tsx`, `actions.ts`, `e2e/admin-settings.spec.ts`.

- Guard SETTINGS_MANAGE. Tabbed/sectioned form: Business (NAP bilingual), Hours, Social, SEO defaults. Save via action (validates against the settings registry).

- [ ] Write e2e: owner → /admin/settings → change WhatsApp number + Instagram handle → save → reload → persisted.
- [ ] Implement. Run e2e green. Commit `feat(admin): site settings page`.

## Task 10: Roles & permissions + Tiers pages

**Files:** Create `src/app/admin/roles/{page.tsx,actions.ts}`, `src/app/admin/tiers/{page.tsx,actions.ts}`, `e2e/admin-roles-tiers.spec.ts`.

- Roles (guard STAFF_MANAGE): matrix of roles × permissions with toggles (save per role); create a new custom role; system roles' core rows read-only-ish (can view; deletion blocked). 
- Tiers (guard SETTINGS_MANAGE): table + create/edit/delete (system tiers not deletable).

- [ ] Write e2e: owner → /admin/roles → toggle a permission on the `marketing` role → save → reload → persisted; → /admin/tiers → create a tier → it appears.
- [ ] Implement. Run e2e green. Commit `feat(admin): roles matrix + tiers management`.

## Task 11: Wire public home to CMS content

**Files:** Modify `src/app/[locale]/(site)/page.tsx`; create `src/modules/cms/publicContent.ts` (read helper); `e2e/public-cms.spec.ts`.

- The public home reads the `home` PageContent + `hero`/`business` settings and renders the hero headline/CTA from the CMS by locale (falling back to i18n messages if no content row). Prove: editing the hero headline in admin changes the public `/ar` (and `/en`) home.

- [ ] Write e2e: set a distinctive hero headline via the content editor (or seed), load `/en` home, assert the headline text appears; load `/ar`, assert the AR headline appears.
- [ ] Implement the read helper + wire the page (server component fetch). Keep the i18n fallback. Run e2e + full suite green; `pnpm build` ok. Commit `feat(cms): public home reads editable content`.

---

## Self-Review

- **Spec coverage (Stage-2 slice):** media library ✓ (T1,2,3,7); editable hero media + page copy ✓ (T3,8,11); global settings incl NAP/hours/social/SEO/hero ✓ (T4,9); roles/permissions config ✓ (T5,10); tiers config ✓ (T5,10); admin shell/nav + guard ✓ (T6). **Service-access-rules config is deferred to the catalog/booking stage** (it needs the Service model, not built yet) — noted, not a gap in this stage.
- **Placeholder scan:** none — tasks name concrete files, interfaces, and test expectations; implementers follow the referenced existing patterns.
- **Type consistency:** `requireAdmin`, `PERMISSIONS` keys, `getCurrentUser` shape, storage interface, and the localized `{en,ar}` shape are used consistently across tasks.
- **Deps:** T7–T11 depend on T1–T6; T5 depends on Stage-1 IAM; T11 depends on T3/T8. Order is linear.
