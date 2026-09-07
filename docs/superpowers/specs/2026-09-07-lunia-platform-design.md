# LUNIA Platform — Design Specification

**Status:** Draft for review
**Date:** 2026-09-07
**Owner:** Lunia founding team
**Author:** Engineering (with founder)

---

## 1. Overview

LUNIA is Saudi Arabia's first **Skin Quality Center** (Riyadh, launching 2026): a
luxury, **non-injectable, non-medical** concept built on Korean beauty philosophy and
leading professional brands, serving Class A / B+ women (18–55). Positioning: **"Not
facials — skin quality"** — every protocol targets measurable improvement in texture,
glow, pores, tone, elasticity, and radiance.

This project delivers **one integrated platform** with two faces sharing a single
database:

1. A **premium bilingual public website** (Gulf-Arabic-first, RTL; English secondary),
   fully SEO- and GEO-optimized.
2. An **internal operating system** (English-first; Arabic secondary) for booking, CRM,
   marketing/growth analytics, business dashboards, communications, a content/media CMS,
   and configurable roles, client tiers, and service-access rules.

The platform is also usable **in-center** (front-desk booking, walk-ins, check-in), not
only for online bookings.

### 1.1 Goals

- A bespoke, unmistakably premium brand experience — **no generic templates**, no emojis.
- **Maximum configurability**: staff roles/permissions, client membership tiers,
  service-access tiers, prices, hours, and most site content editable from the control
  panel (including hero images/videos and section copy).
- **Real, integrated data**: a booking on the site becomes a client profile, appears on
  the staff calendar, and feeds CAC/LTV dashboards — no cross-system sync.
- **SEO + GEO** engineered in from day one (generative-engine visibility *and*
  Riyadh/local search).
- Deployable and maintainable on the client's **Namecheap VPS**.

### 1.2 Non-goals (v1)

- No medical services, wound care, injectables, or lasers anywhere in content or booking.
- No native mobile apps (responsive web only).
- No multi-location operations at launch (but the data model is multi-location-ready).

### 1.3 Decisions locked with the founder

| Decision | Choice |
| --- | --- |
| Build approach | Custom full-stack app (Next.js + Node + PostgreSQL), self-hosted on VPS |
| Public website language | Gulf/Saudi Arabic primary (RTL), English secondary |
| Internal system language | English primary (LTR), Gulf Arabic secondary |
| Booking | Custom, integrated (shared DB with profiles/dashboards/comms) |
| Payments | Build payment-ready; a KSA gateway (Moyasar/Tap/HyperPay) switched on later |
| Account levels | Client membership tiers **+** staff roles/permissions **+** service-access tiers, all configurable |
| Client login | Yes — lightweight phone-OTP login (view bookings, history, packages, rebook) |
| GEO | Both generative-engine optimization **and** geographic/local SEO |
| Launch scope | Full platform before launch, built in reviewable internal stages |

---

## 2. Architecture

### 2.1 Topology

- **Single Next.js (App Router) application**, TypeScript throughout, with route groups:
  - `(site)` — public website, localized `/[locale]/...` (`ar` default, `en`), RTL-aware.
  - `(admin)` — internal system under `/admin`, English default.
  - `(client)` — client account area (bookings, history, packages).
- **API / server logic** via Route Handlers + Server Actions, over a typed **service
  layer** (business logic isolated from transport and UI).
- **Background worker** (separate process) for scheduled/async work: reminders, WhatsApp/SMS
  sends, nightly analytics rollups, sitemap regeneration. Queue via **BullMQ on Redis**.
- **PostgreSQL** as system of record; **Prisma** ORM (typed schema + migrations).
- **Redis** for the queue, sessions/cache, and rate limiting.
- **Media storage**: local filesystem behind Nginx to start (volume-mounted, backed up),
  abstracted behind a storage interface so an S3-compatible bucket can replace it later.

### 2.2 Rationale for isolation

Each subsystem is a bounded module with a clear interface and its own tests:

- `catalog` (departments, services, packages, brands, pricing, access rules)
- `booking` (availability, appointments, resources, check-in)
- `crm` (clients, tiers, visit notes, attribution)
- `growth` (CAC/LTV, campaigns, reporting)
- `comms` (provider-agnostic WhatsApp/SMS + templates)
- `cms` (media, page sections, settings, translations)
- `analytics` (first-party events, attribution)
- `iam` (users, roles, permissions, auth)

UI consumes these modules through typed services; internals can change without breaking
callers.

### 2.3 Tech stack summary

| Concern | Choice |
| --- | --- |
| Framework | Next.js (App Router) + TypeScript |
| DB / ORM | PostgreSQL + Prisma |
| Cache/queue | Redis + BullMQ |
| Auth | Session-based, RBAC; staff email+password (+ optional 2FA), clients phone-OTP |
| i18n | `next-intl` (message catalogs, `dir` switching, hreflang, localized routes) |
| Styling | Tailwind CSS + bespoke brand tokens (CSS variables); custom component library |
| Testing | Vitest (unit), Playwright (e2e), Prisma test DB |
| Deploy | Docker Compose on VPS: app + worker + Postgres + Redis + Nginx + Certbot (TLS) |
| Backups | Nightly `pg_dump` + media snapshot, offsite copy |

---

## 3. Data model (core entities)

Names are indicative; final schema in Prisma.

### 3.1 Identity & access (`iam`)
- **User** — staff and clients; `type` (STAFF | CLIENT), auth fields, locale, status.
- **Role**, **Permission**, **RolePermission** — configurable RBAC.
  Default roles: Owner/Admin, Manager, Reception/Front-desk, Specialist/Therapist,
  Marketing, Client.
- **StaffProfile** — specialties, schedule link, bio (for website team section).
- **ClientProfile** — contact, `sourceChannelId` (how they found Lunia), `tierId`, LTV
  cache, consent flags, notes.

### 3.2 Membership & access tiers
- **MembershipTier** — Guest → Member → VIP + program tiers (Bride, Post-Surgery);
  perks, booking priority, discounts.
- **ClientMembership** — tier assignment, validity, source.
- **ServiceAccessRule** — a service/package restricted to tiers, and/or flagged
  online-bookable vs in-center-only.

### 3.3 Catalog (`catalog`)
- **Department** — Skin, Hair & Scalp, Post-Surgery Recovery (+ Korean Signature grouping).
- **Service** → **ServiceVariant** (duration/price), benefits, brand links, media.
- **Package**, **Program**, **MembershipPlan** — bundles/subscriptions.
- **Brand** — ZO Skin Health, PCA, Image Skincare, EltaMD, 72 Hair (+ page content).
- **RetailProduct** — homecare retail (commerce-ready).

### 3.4 Operations (`booking`)
- **Booking** → **AppointmentItem** (service, staff, room/resource, start/end, status),
  deposit/payment status, `sourceChannelId`, notes, channel (online/front-desk/walk-in).
- **Resource/Room**, **StaffSchedule/Availability**, **BusinessHours**, **Closure**.
- **CheckIn** — in-center arrival state.

### 3.5 CRM & growth (`crm`, `growth`)
- **VisitNote** — per-visit therapist notes tied to appointment + client.
- **Channel/Source** — Instagram, referral, Google, walk-in, etc.
- **CampaignSpend** — spend by channel/date → CAC.
- **Transaction** — revenue events → LTV.
- **Report** definitions + saved filters.

### 3.6 Content & marketing (`cms`)
- **MediaAsset** (images/video, alt text, focal point), **PageSection**/**ContentBlock**,
  **SiteSetting**, **Translation**, **BlogPost** + Category/Author,
  **ResultsGalleryItem** (category, consent), **Testimonial**.

### 3.7 Communications & analytics
- **CommunicationLog**, **MessageTemplate** (per channel/locale).
- **PageView**, **AnalyticsEvent**, **ConversionEvent** — first-party attribution linking
  booking → source.

### 3.8 Location
- **Location** dimension present from day one (single center now, multi-location-ready).

---

## 4. Public website

Gulf-Arabic-first (RTL), English secondary, all content CMS-editable.

| Page | Contents |
| --- | --- |
| **Home** | Editable hero (image/video) + brand statement; "Skin Quality Center, not a spa" intro; services teaser; featured brands; social proof; Book CTA |
| **About** | Story & philosophy; "not facials → skin quality"; the 6-step journey (Analyze→Personalize→Treat→Relax→Maintain→Return); team/specialists |
| **Services** | Overview + a page per department (Skin / Hair & Scalp / Post-Surgery); each service with benefits + Book CTA |
| **Brands** | A page per brand: what it is, why Lunia chose it, treatments that use it |
| **Results Gallery** | By category, tasteful, consent-flagged |
| **Journal (Blog)** | Skin/hair education, K-beauty philosophy, treatment guides — bilingual |
| **Booking** | Service → date/time → confirmation |
| **Contact** | Location/map, WhatsApp, socials, inquiry form |

**Design system:** primary serif **The Seasons** (headlines) + **Inter** (body); Arabic
**F37 Wicklow** + Avenir Next; Luminous Teal palette (`#9ed5d0`, `#93ccc6`, `#86bfb8`)
with warm gold/cream secondaries (`#c0ad73`, `#cdbb85`, `#d9cca3`, `#ebe5d3`); moon/star
"Glow" emblem; wave + mosaic patterns; authentic, real-texture photography with negative
space. Tokens as CSS variables; RTL via logical properties. Commercial fonts are used only
once web licenses are confirmed; close free matches serve as placeholders meanwhile.

---

## 5. SEO + GEO

**Technical:** SSR/SSG, semantic HTML, per-locale metadata, **hreflang** (ar-SA/en) +
canonical, generated `sitemap.xml` + `robots.txt`, strong Core Web Vitals, optimized/lazy
images.

**Structured data (JSON-LD):** `HealthAndBeautyBusiness`/`LocalBusiness`, `Service`,
`FAQPage`, `BreadcrumbList`, `Article`, `AggregateRating`.

**Local/geo:** Riyadh + district landing content (Diplomatic Quarter, Al Malqa, Al Narjis,
Hittin, Qurtubah, Al Safarat), NAP consistency, Google Business Profile alignment,
Arabic-first local copy.

**Generative (GEO):** clear factual entity content, rich FAQs, `llms.txt`, and
education/comparison pages targeting the audience's real questions so AI assistants
recommend Lunia. Competitor mining (plumpfacialbar, rivive.sa, skinsoul.studio,
maison_care.hs) informs keyword/positioning gaps during the content phase.

---

## 6. Booking & operations

- **Client flow:** service (tier-gated where configured) → date/time from real
  staff+room availability → contact → confirm (payment-ready, off initially) →
  WhatsApp/SMS confirmation. **Client profile auto-created** on first booking with source
  captured.
- **Staff:** day/week calendar, per-specialist views, drag-to-reschedule, walk-ins,
  **in-center check-in**, and a front-desk "book on the spot" mode.
- **Reminders:** automatic 24h (configurable) + post-visit message via the worker.

---

## 7. CRM, dashboards & reports

- **Client profiles:** info + treatment history + per-visit notes + source + tier + LTV.
- **Business dashboard:** revenue today/week/month, top services, new vs returning,
  occupancy.
- **Marketing/Growth:** CAC by channel (spend ÷ acquisitions), LTV per client, new/returning
  ratio, best-quality channel (low CAC + high LTV), booking conversion rate, traffic
  sources, top pages.
- **Report center:** filterable, exportable (CSV/PDF) across bookings, revenue, clients,
  marketing. Reusable search/filter components on every major list.

---

## 8. Communications

Provider-agnostic layer: **WhatsApp** (Meta Cloud API / Twilio / 360dialog) + **SMS**
(Unifonic for KSA) behind one interface. Templates for booking confirmation, 24h reminder,
post-visit message, per channel + locale. Starts as click-to-WhatsApp + templated flows;
full API activates when credentials + business verification are provided by the client.

---

## 9. Non-functional requirements

- **Accessibility:** WCAG 2.1 AA; full keyboard nav; RTL + LTR verified; contrast checked
  against brand palette.
- **Performance:** Core Web Vitals green; image optimization; caching; code-splitting.
- **Security:** RBAC enforced server-side; input validation; rate limiting; secrets in env
  (never in repo); CSRF/session hardening; audit log for sensitive admin actions;
  least-privilege DB. No payment credentials handled by the build — client configures
  gateway keys.
- **Privacy/consent:** consent flags for results gallery and marketing; PDPL-aware data
  handling (KSA).
- **Reliability:** nightly backups (DB + media), health checks, structured logging,
  restore procedure documented.
- **Ops:** Docker Compose, `.env.example`, deploy + rollback scripts, runbook.

---

## 10. Deployment

Namecheap VPS via Docker Compose: app + worker + Postgres + Redis + Nginx reverse proxy +
Certbot TLS. VPS inventory (OS, resources) checked over SSH **before** deploy; root
password to be rotated by client (was shared in chat). Domain + DNS configured with client.
Nightly backups with offsite copy.

---

## 11. Staged build plan (all before launch, reviewable)

1. **Foundation** — repo, DB schema, auth/RBAC, i18n/RTL, design system + brand tokens,
   Docker/deploy skeleton.
2. **CMS & settings** — media library, page-section editor, site settings; roles/tiers/
   service-access configuration UI.
3. **Public website** — all pages + SEO/GEO + schema, bilingual.
4. **Booking & ops** — engine, staff calendar, check-in, client profiles, reminders,
   client login.
5. **CRM + dashboards + reports** — business/marketing analytics, CAC/LTV, first-party
   attribution.
6. **Communications** — WhatsApp/SMS templates + automation.
7. **Content, QA, hardening, deploy** — real content, accessibility, performance,
   security, backups, go-live.

Each stage: TDD where it applies, review checkpoint, then proceed.

---

## 12. Inputs needed from the client (non-blocking; gathered during build)

- Logo files (SVG/PNG) + emblem/favicon.
- Web-font licenses for **The Seasons** and **F37 Wicklow Arabic** (else close matches used).
- Real photography (or interim art direction).
- Domain name + DNS access.
- Finalized service list with prices, durations, department mapping.
- Staff list/bios for the team section.
- Business details: address, hours, WhatsApp number, social links (NAP).
- Later: WhatsApp Business API + SMS provider credentials; payment gateway keys.

---

## 13. Open questions / assumptions

- **Assumption:** single center at launch; multi-location deferred but modeled.
- **Assumption:** results gallery uses consented, non-medical "skin quality" imagery only.
- **To confirm during build:** exact membership tier names/perks; reminder timing defaults;
  which channels seed the attribution list.
