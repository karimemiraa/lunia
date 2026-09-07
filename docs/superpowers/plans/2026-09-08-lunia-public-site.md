# Lunia Public Website — Implementation Plan (Stage 3 of 7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** The full, premium, bilingual (Gulf-Arabic-default/RTL, English) public website — Home, About, Services (+ per-department), Brands (+ per-brand), Results Gallery, Journal, Contact — rendered from editable CMS + catalog content, and fully SEO- + GEO-optimized (metadata, hreflang, JSON-LD, sitemap, robots, llms.txt, Riyadh local content).

**Architecture:** New `catalog` domain (Department, Service, Brand, BlogPost, ContactInquiry) with content services + light admin CRUD; a set of reusable, brand-faithful public section components; localized App-Router pages that read catalog + CMS content; a shared SEO layer (metadata builders + JSON-LD components + sitemap/robots/llms routes).

**Tech Stack:** Existing repo stack (Next 16 App Router, Prisma 7 adapter via `@/lib/db`, next-intl, Tailwind v4 brand tokens, Vitest + Playwright). Reuse Stage-1/2 patterns: `@/lib/db`, `requireAdmin`, `AdminShell`, `LocalizedField` (emits `name.en`/`name.ar`), `getSetting`, `getPageContent`, `/api/media/<key>` for media, brand tokens in `src/app/globals.css`.

**Spec:** `docs/superpowers/specs/2026-09-07-lunia-platform-design.md` (§4 public website, §5 SEO/GEO) + the Strategic Foundation (departments/services/brands) and Brand Guidelines (visual system).

## Global Constraints

- **Brand fidelity (no generic template, no emojis):** Serif display `--font-display` (headlines/pull-quotes) + `--font-body` Inter (body/nav); Arabic `--font-display-ar` / `--font-body-ar`. Palette: Luminous Teal `#9ed5d0` / Deep Canopy `#93ccc6` / Alice Blue `#86bfb8` + warm secondaries gold `#c0ad73` / marigold `#cdbb85` / dragonfruit `#d9cca3` / cream `#ebe5d3`, ink `#1c2b2a`, page ground `#fbfaf7`. Generous whitespace/negative space, calm/luminous tone, moon/star "Glow" motif accents, optional subtle wave/mosaic pattern used sparingly. Voice: authoritative yet gentle, sensory (luminescence, restoration, glow). Positioning line to honor everywhere: **"Not facials — skin quality."**
- **Bilingual + RTL:** every page works at `/ar` (default, `dir=rtl`) and `/en`. All visible copy comes from next-intl messages, CMS content, or catalog content — never hardcoded English in a component. Use CSS **logical properties** (margin-inline, text-align:start) so one layout serves both directions. Gulf-Arabic phrasing (not stiff MSA) for site copy.
- **Content is editable:** Services/Brands/Journal render from DB (catalog) editable in admin; Home/About section copy from CMS `PageContent` + `SiteSetting`; NAP/social/hours from `SiteSetting`. Nothing user-facing is hardcoded that the brief says should be editable.
- **SEO/GEO first-class:** every page exports `generateMetadata` (localized title/description, canonical, `alternates.languages` hreflang for ar/en + x-default, Open Graph); JSON-LD where relevant; images use `next/image` (or `<img>` with width/height + lazy) with real `alt`; semantic headings (one h1/page).
- **Accessibility:** WCAG AA — color contrast, focus states, keyboard nav, labelled controls, `lang`/`dir` correct.
- TS strict (no unjustified `any`), no emojis, conventional commits, TDD where practical (unit for services/SEO builders; Playwright e2e for page flows), each task committed + green. Prisma migrations committed; seed idempotent (reuse the PrismaPg-adapter seed pattern).

---

## File Structure

```
prisma/schema.prisma                      # + Department, Service, Brand, BlogPost, ContactInquiry
prisma/seed.ts                            # + seed catalog from Strategic Foundation
src/modules/catalog/{departments.ts,services.ts,brands.ts,journal.ts,inquiries.ts}
src/modules/seo/{metadata.ts,jsonld.ts}   # metadata builder + JSON-LD helpers
src/components/site/                       # public components
  {SiteHeader.tsx,SiteFooter.tsx,LocaleSwitcher.tsx,Section.tsx,SectionHeading.tsx,
   Hero.tsx,JourneySteps.tsx,ServiceCard.tsx,BrandCard.tsx,Testimonials.tsx,
   ResultsGallery.tsx,CtaBand.tsx,Faq.tsx,Prose.tsx,MediaFrame.tsx}
src/app/[locale]/(site)/
  layout.tsx                              # + SiteHeader/SiteFooter chrome (keep root html/dir)
  page.tsx                                # Home (exists → expand)
  about/page.tsx
  services/page.tsx  services/[slug]/page.tsx
  brands/page.tsx    brands/[slug]/page.tsx
  results/page.tsx
  journal/page.tsx   journal/[slug]/page.tsx
  contact/{page.tsx,actions.ts}
src/app/sitemap.ts  src/app/robots.ts  src/app/[locale]/llms.txt/route.ts (or public llms.txt)
src/app/admin/catalog/{page.tsx,...}      # light CRUD for departments/services/brands/journal
messages/{ar,en}.json                     # + all site copy keys
```

---

## Task 1: Catalog + content schema & seed

**Files:** `prisma/schema.prisma` (+ models), migration, `prisma/seed.ts` (+ catalog seed), `tests/catalog/model.test.ts`.

Models (bilingual fields as `xEn/xAr`, all with `slug @unique`, `order Int`, `isPublished Boolean @default(true)`, timestamps; media via `heroMediaId String?`):
- `Department` { slug, nameEn/Ar, taglineEn/Ar, descEn/Ar, heroMediaId?, order }
- `Service` { slug, departmentId (FK), nameEn/Ar, summaryEn/Ar, benefitsEn/Ar (String[] or JSON), heroMediaId?, order }
- `Brand` { slug, name, descEn/Ar, whyChosenEn/Ar, logoMediaId?, order, url? }
- `BlogPost` { slug, titleEn/Ar, excerptEn/Ar, bodyEn/Ar (String @db.Text), heroMediaId?, authorName?, publishedAt DateTime?, isPublished }
- `ContactInquiry` { id, name, phone, email?, message, locale, sourcePage?, createdAt, handled Boolean @default(false) }

Seed (idempotent upsert by slug) the 3 departments + their services and the 5 brands from the Strategic Foundation:
- Departments: `skin` (Skin Quality), `hair-scalp` (Hair & Scalp), `post-surgery` (Post-Surgery Recovery).
- Skin services: diagnostic-skin-analysis, signature-facials-hydrafacial, led-light-therapy, microdermabrasion-peels. Hair: scalp-diagnostic-analysis, led-lllt-cap-therapy, scalp-detox, scalp-massage-oxygen. Post-surgery: manual-lymphatic-drainage, pressotherapy, compression-garment-guidance, recovery-lounge. (Use the Strategic Foundation descriptions; Arabic can be a faithful translation placeholder.)
- Brands: `zo-skin-health` (ZO Skin Health), `pca` (PCA), `image-skincare` (Image Skincare), `eltamd` (EltaMD), `72-hair` (72 Hair). Short factual desc + a "why Lunia chose it" line each.
- 2–3 starter Journal posts (K-beauty philosophy, a treatment guide) so the Journal isn't empty.

- [ ] Add models; migrate (`--name catalog`); generate. Round-trip test. Seed idempotent (run twice). Commit `feat(catalog): schema + seed from strategic foundation`.

## Task 2: Catalog content services

**Files:** `src/modules/catalog/{departments,services,brands,journal,inquiries}.ts`, `tests/catalog/services.test.ts`.

Read helpers (published-only for public, locale-aware projection helper): `listDepartments()`, `getDepartmentBySlug(slug)`, `listServices(departmentId?)`, `getServiceBySlug`, `listBrands()`, `getBrandBySlug`, `listPublishedPosts()`, `getPostBySlug`. A `localize(entity, locale)` helper that maps `xEn/xAr` → the locale's value. `inquiries.createInquiry(input)` (validates via Zod) + `listInquiries()`.

- [ ] TDD services (seeded data reads; localize picks ar/en; createInquiry validates). Commit `feat(catalog): content read services + inquiries`.

## Task 3: Public chrome — SiteHeader, SiteFooter, LocaleSwitcher, layout

**Files:** `src/components/site/{SiteHeader,SiteFooter,LocaleSwitcher,Section,SectionHeading,Prose,MediaFrame}.tsx`, modify `src/app/[locale]/(site)/layout.tsx`, `messages/{ar,en}.json` (+ nav/footer keys), `tests/site/localeSwitcher.test.tsx`.

- SiteHeader: brand wordmark (text set in `--font-display` until a logo asset is uploaded), nav (Home/About/Services/Brands/Results/Journal/Contact), a prominent **Book Now** CTA (teal), and a LocaleSwitcher (ar⇄en preserving the current path). Sticky, elegant, whitespace-rich; RTL mirrored via logical props. Mobile: an accessible menu.
- SiteFooter: NAP + WhatsApp + Instagram (from `getSetting("business")`/`("social")`), nav, a short brand line, © and locale switch.
- Section/SectionHeading/Prose/MediaFrame: layout primitives with brand spacing/typography; MediaFrame renders an image/video from a media key with focal positioning + graceful empty state.
- layout.tsx keeps the root `<html lang dir>` + adds `<SiteHeader/>{children}<SiteFooter/>`.

- [ ] TDD LocaleSwitcher path preservation (unit) + build. Commit `feat(site): header, footer, locale switcher, layout chrome`.

## Task 4: Reusable section components

**Files:** `src/components/site/{Hero,JourneySteps,ServiceCard,BrandCard,Testimonials,ResultsGallery,CtaBand,Faq}.tsx`, component tests for a couple.

- Hero: full-bleed media (image/video by kind) + overlaid headline (serif) + subhead + CTA, ample negative space, teal CTA box, RTL-aware alignment.
- JourneySteps: the 6-moment journey (Analyze→Personalize→Treat→Relax→Maintain→Return) as an elegant numbered sequence with the star/glow motif.
- ServiceCard / BrandCard: refined cards (image, name, short line, link), hover states, no boxy template look.
- Testimonials: quiet, editorial quotes. ResultsGallery: tasteful category-filtered grid (consent-flagged placeholder). CtaBand: recurring "Start your journey" booking band. Faq: accessible accordion (also feeds FAQPage schema).

- [ ] TDD a couple (JourneySteps renders 6 steps localized; Faq toggles). Commit `feat(site): reusable premium section components`.

## Task 5: SEO layer — metadata builder + JSON-LD + sitemap/robots/llms

**Files:** `src/modules/seo/{metadata.ts,jsonld.ts}`, `src/app/sitemap.ts`, `src/app/robots.ts`, `public/llms.txt` (or a route), `tests/seo/*.test.ts`.

- `buildMetadata({ locale, path, titleEn/Ar, descEn/Ar, ogMediaKey? })`: returns a Next `Metadata` with localized title/description, `alternates.canonical` + `alternates.languages` (ar-SA, en, x-default), Open Graph + Twitter. Base URL from `getSetting`/env `APP_URL`.
- `jsonld.ts`: helpers returning JSON-LD objects: `localBusiness()` (HealthAndBeautyBusiness: name, Riyadh address from settings, geo, hours, sameAs socials), `service(service)`, `breadcrumb(items)`, `article(post)`, `faqPage(qa[])`. A small `<JsonLd data={...}/>` component (script type application/ld+json).
- `sitemap.ts`: all localized routes (static + dynamic services/brands/journal) with hreflang alternates. `robots.ts`: allow all, point to sitemap. `llms.txt`: a concise plain-text brand/entity summary + key URLs for AI engines.

- [ ] TDD metadata builder (hreflang languages present; canonical correct) + sitemap includes dynamic slugs. Commit `feat(seo): metadata, json-ld, sitemap, robots, llms`.

## Task 6: Home page (full)

**Files:** `src/app/[locale]/(site)/page.tsx` (expand), `messages` keys, `e2e/site-home.spec.ts`.

Sections: Hero (CMS content, image/video) → "Skin Quality Center, not a spa" intro (the positioning) → Services teaser (3 departments) → Featured brands → Social proof → CTA band. `generateMetadata` + LocalBusiness JSON-LD. Reads catalog + CMS.

- [ ] e2e: `/ar` and `/en` home render hero h1 + a services section + a brands section + Book CTA; dir correct; metadata title present. Commit `feat(site): home page`.

## Task 7: About + Services pages

**Files:** `about/page.tsx`, `services/page.tsx`, `services/[slug]/page.tsx`, messages, `e2e/site-about-services.spec.ts`.

- About: story/philosophy (CMS/messages), the "not facials → skin quality" section, the 6-step JourneySteps, team placeholder. Metadata + Breadcrumb JSON-LD.
- Services overview: the 3 departments with their services. `services/[slug]`: a department page listing its services (each with benefits) + Book CTA + Service JSON-LD + Breadcrumb. `generateStaticParams` from catalog.

- [ ] e2e: services overview lists 3 departments; a department page (e.g. /en/services/skin) lists its services; about shows the 6 steps. Commit `feat(site): about + services pages`.

## Task 8: Brands + Results + Journal + Contact

**Files:** `brands/page.tsx`, `brands/[slug]/page.tsx`, `results/page.tsx`, `journal/page.tsx`, `journal/[slug]/page.tsx`, `contact/{page.tsx,actions.ts}`, messages, `e2e/site-brands-journal-contact.spec.ts`.

- Brands overview + per-brand pages (what it is, why Lunia chose it, treatments using it) + Breadcrumb JSON-LD; `generateStaticParams`.
- Results gallery: category-filtered tasteful grid (placeholder media, consent note).
- Journal list + post page (`article` JSON-LD, published-only, `generateStaticParams`).
- Contact: NAP + WhatsApp + Instagram + map embed placeholder + an inquiry form (name/phone/message) → `contact/actions.ts` `submitInquiry` stores via `createInquiry` (validates; no external send yet) and returns success. LocalBusiness JSON-LD.

- [ ] e2e: brands overview + a brand page; journal list + a post; contact form submit shows success and creates a ContactInquiry row. Commit `feat(site): brands, results, journal, contact`.

## Task 9: Catalog admin CRUD (light)

**Files:** `src/app/admin/catalog/{page.tsx, departments/*, services/*, brands/*, journal/*}` + actions, `e2e/admin-catalog.spec.ts`.

- Under CMS_MANAGE: list + edit content for Departments, Services, Brands, Journal posts (bilingual via LocalizedField, media picker, publish toggle, order). Reuse the Stage-2 admin page+action+AdminShell pattern. Create/edit/delete + publish. Plus an Inquiries list (read-only) under CMS_MANAGE showing ContactInquiry rows.
- Add Catalog + Inquiries links to AdminNav (gated CMS_MANAGE).

- [ ] e2e: owner edits a service name → it changes on the public services page; a new journal post appears in the journal. Commit `feat(admin): catalog + journal + inquiries management`.

## Task 10: SEO wiring, polish, a11y & full-site e2e

**Files:** wire `generateMetadata` + JSON-LD across all pages (audit), `next.config` image settings if needed, `tests`/`e2e` additions.

- Ensure every page has localized metadata + hreflang + canonical; sitemap lists all dynamic slugs; robots + llms served; one h1 per page; images have alt + dimensions; focus/keyboard states; contrast checked. Add a small e2e crawling key routes asserting 200 + a title + hreflang link tags; assert sitemap.xml and robots.txt respond.

- [ ] Full `pnpm test` + `pnpm e2e` green; `pnpm build` clean. Commit `feat(seo): site-wide metadata/schema wiring + a11y polish`.

---

## Self-Review

- **Spec coverage (Stage-3):** Home/About/Services(+dept)/Brands(+brand)/Results/Journal/Contact ✓ (T6–T8); 6-step journey ✓ (T4,T7); catalog content + editability ✓ (T1,T2,T9); SEO (metadata/hreflang/canonical/OG) ✓ (T5,T10); JSON-LD (LocalBusiness/Service/Article/Breadcrumb/FAQ) ✓ (T5); sitemap/robots/llms ✓ (T5); local Riyadh content + NAP ✓ (T3 footer/T5 schema/T8 contact); bilingual RTL throughout ✓. Booking flow itself is Stage 4 — the Book CTAs link to `/[locale]/contact` or a `#book` placeholder until Stage 4 wires the booking route (note in T6).
- **Deps:** T1→T2→(T3,T4,T5)→T6→T7→T8→T9→T10, mostly linear; T3/T4/T5 are parallelizable in principle but run in order under SDD.
- **Placeholders:** real media/photography and final Arabic copy are client-provided later; components must render gracefully with placeholder media + seeded copy.
- **Book CTA target:** until Stage 4, Book Now links to `/[locale]/contact`; Stage 4 repoints to the booking route.
