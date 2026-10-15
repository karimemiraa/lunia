# PRD: Native Gulf Arabic across the system

Status: **approved 2026-10-15**. Phase 1 (customer-facing) and Phase 2 (staff console) shipped 2026-10-15

Decisions:
- **Tone:** mixed by surface, as in the table below.
- **Address:** feminine for customers (احجزي، تواصلي) everywhere, including WhatsApp, SMS and email.
- **Admin:** all of it, shipped in phases after the customer-facing work.
- **Database content:** a review sheet with suggested rewrites only. Nothing in production is changed.

## Problem

When the language is switched to Arabic, the system isn't fully Arabic, and the Arabic it does have doesn't sound native:

- **Staff admin:** only the menus, sidebar, breadcrumbs and top bar switch to Arabic. Every page's content (tables, forms, buttons, messages) stays English. That's about **2,200+ strings in 265 files**, all written directly in the code.
- **Public site and customer account:** the 801 text strings all have Arabic versions. But some English still leaks through:
  - Booking, login and review errors pass the server's English message straight to the customer (e.g. "That time was just taken").
  - "View as customer" messages are English.
  - About 24 hard-coded strings sit in the footer, testimonials, charts and forms.
- **Tone is mixed:**
  - Formal Arabic ("نتشرّف بزيارتك") sits beside Gulf words ("هلا", "الحين", "عشان"), the latter in 38 strings.
  - The site addresses women ("احجزي"), but some WhatsApp templates address men ("تواصل معنا").

## Success criteria

1. Switching to Arabic shows Arabic everywhere in scope, with only these exceptions: brand and product names, numbers, emails, phone numbers and codes. **An automated test** opens every page in Arabic and fails on any other visible English.
2. The copy reads like a Saudi/Gulf clinic talking to its customers: warm, short and natural, not translated. It follows one glossary and one gender rule everywhere.
3. Right-to-left layout is correct on every translated page: alignment, icons, tables, number and date formats.
4. Nothing breaks in English. All existing tests stay green.

## Tone by surface

| Surface | Register | Why |
|---|---|---|
| Website marketing, booking flow, account, WhatsApp/SMS/email | **Saudi "white" Gulf dialect**: understood across the Gulf, light on heavy Najdi slang | This is the customer's voice. It should feel local and warm. |
| Consent forms, health questionnaire, invoices, privacy/terms, legal and tax wording | **Clear formal Arabic** with a soft tone | These are legal and medical records. Dialect can read as unprofessional, or be ambiguous in a dispute. ZATCA invoice titles are fixed wording. |
| Staff admin | **Gulf workplace Arabic**: the plain, short labels Saudi staff use day to day (e.g. "حفظ", "إلغاء", "المواعيد") | Staff need speed and clarity. Slang in buttons gets tiring. |

## Scope

**In scope:**
- Phase 1, customer-facing:
  - Rewrite all 801 site and account strings in the chosen register, following the glossary.
  - Fix the English leaks (translate server errors through error codes).
  - Rewrite the WhatsApp/SMS/email default templates and email layouts.
  - Add the automated "no English when Arabic" test for the public site.
- Phase 2, staff admin:
  - Add a real translation layer to the admin (the existing Display → Arabic switch turns on full Arabic and RTL).
  - Move the ~2,200 strings into it, and translate them, the Ask Lunia guides, and the server-action messages.
  - Run the same automated test over every admin page.
- Glossary file `docs/arabic-glossary.md`: one approved term per concept (e.g. موعد not حجز for an appointment; جلسة; باقة; فاتورة).
- A review sheet: every string shown in English beside Arabic, for a native Saudi reviewer.

**Out of scope unless you say otherwise (see question 4):**
- Arabic text staff typed into the database: service and brand descriptions, journal posts, custom message templates.
- The superadmin area (platform owner only).
- Real-time Ask Lunia AI answers. They already reply in the user's language; I'll only translate its fixed text.

## Constraints and risks

- **I'm not a native speaker.** My Gulf Arabic is good but not guaranteed. A Saudi staff member should review the sheet before or soon after release. I'll flag lines I'm less sure of.
- Phase 2 is large: it touches nearly every admin file. It is mechanical, but every page needs to be re-tested in both languages, and several days of tool time is realistic.
- The Ask Lunia guides quote button labels, and a test checks that those labels exist in the UI. Guides will need both languages.
- WhatsApp templates approved by Meta must keep their approved wording. Changed defaults only apply to templates that haven't been customised or approved yet.

## Build plan

1. Write the glossary and gender rule, then rewrite `ar.json` (site and account) in the chosen register.
2. Turn server errors into error codes with Arabic text, translate the remaining hard-coded strings, then rewrite templates and email copy.
3. Write the "no visible English" e2e crawler for /ar pages, then fix whatever it finds.
4. Ship Phase 1, produce the review sheet, and gather your reviewer's feedback.
5. Phase 2: admin translation layer → strings moved section by section (calendar and clients first, then billing, inventory, HR, settings, and so on) → Arabic → crawler over admin routes → ship in batches.
