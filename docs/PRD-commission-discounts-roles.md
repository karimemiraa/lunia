# PRD: Specialist commission, specialist discounts, and roles that match the job

Status: **approved 2026-10-16**, **shipped 2026-10-17** (operations notes: RUNBOOK §3.10)

**Build note:** defining or pricing a *package* needs the Catalog permission (Manager), not Settings. This keeps "Manager owns prices" consistent. Selling one needs Billing.

**Decisions (owner, 2026-10-16):**
- **Q1:** each specialist has a services % and a products %, and any service can override the services %. Packages earn commission per session used, not when sold.
- **Q2:** specialists can discount up to 10% straight away, with a reason. Anything above waits for a manager. Commission is calculated after the discount.
- **Q3:** Marketing loses services and prices. Manager, Admin and Owner own the catalog.
- **Q4 / Q5:** apply the new matrix to the live built-in roles now, with before/after in the audit log; custom roles are left alone. The loyalty-tier discount is applied at billing.

## 1. Problem

The owner asked for three things:

1. **Commission for the skin specialists** (الكوميشن), worked out properly and visible.
2. **The skin specialist can give a discount.**
3. **Every role checked**, so each person sees exactly what their job needs. No more and no less.

Today, from a full audit of every admin page and action:

**Commission**
- One flat % per employee (HR file), applied to the service's *list price* on completed bookings.
- It ignores discounts and whether the invoice was paid at all.
- Product sales (retail creams, sunscreen) earn nothing, though recommending homecare is a normal part of a Saudi skin specialist's job.
- Specialists can only see their commission after payroll is approved, on the payslip. There is no running total for the month.
- Anyone with "reports" access (sales, telesales, marketing) can see **every** colleague's commission.

**Discounts**
- Only billing staff can discount: line discounts, an invoice discount, or simply editing the price.
- There is no limit, nothing records who gave the discount, and nothing records why.
- Specialists have no way to give one.
- **Push back:** if specialists can discount while commission stays on list price, a discount costs them nothing. Commission **must** move to the amount actually charged.

**Roles: bugs found**

| # | Problem | Effect today |
|---|---|---|
| R1 | "Manage catalog" permission is never checked. Catalog pages check "Manage content" instead | **Manager cannot edit services or prices**, while **Marketing can change prices** |
| R2 | Anyone with "Manage users & roles" can grant any permission, including to themselves | A manager can make themselves admin |
| R3 | Commission column visible to anyone with reports access | Sales, telesales and marketing see everyone's pay data |
| R4 | Specialists hold the patient file but editing skin type and allergies needs "Manage customers" | **Specialists can't record an allergy** |
| R5 | Reception, sales, telesales and manager can't write notes or comments | The front desk can't leave a note on a customer |
| R6 | Issuing gift cards and assigning packages need "Settings" | Front desk can't sell a gift card or package at the counter |
| R7 | The consent "sign at the desk" screen needs full patient-file access | Reception can't hand the tablet over without seeing medical history |
| R8 | Leads and call-backs show for specialists, but they can't act on them | Menu noise for specialists |
| R9 | Loyalty tier "discount %" is stored but never applied | Configured tier discounts silently don't happen |

## 2. Success criteria

1. **Commission** is calculated on what the customer actually paid for the specialist's work:
   - excluding VAT, after discounts, on paid invoices only;
   - services and products at separate rates;
   - each specialist sees their running month on "My time & pay";
   - only HR and the owner see everyone's.
2. **A specialist can give a discount** on their own customer's visit, from the visit board or the appointment page.
   - Within their cap, it applies straight away.
   - Above the cap, it waits for a manager to approve.
   - Every discount records who gave it, how much, and why. It appears on the visit timeline and in a "Discounts" report.
3. **Each role** opens only what that job uses. R1–R8 are fixed and covered by tests. A manager can't grant more than they hold.
4. Everything works in Arabic/RTL, and existing invoices and payslips are untouched.

## 3. Scope

### 3.1 Commission

- **Rates:**
  - The HR file gets two rates: **services %** (the existing field) and **products %** (new).
  - Optional: a per-service rate that overrides the services % (see Q1).
- **What counts:**
  - Invoice lines on invoices that are **paid in full**, counted in the month the invoice was **issued**.
  - The amount is the net after the line discount and its share of the invoice discount, **excluding VAT**.
  - Gift cards and memberships never earn commission. Packages: see Q1.
- **Who it counts for:**
  - Service lines go to the appointment's specialist.
  - Product lines go to the new **"Sold by"** on the invoice line, which defaults to the booking's specialist and can be changed by front desk.
- **Refunds:** a credit note reduces the commission in the month it is issued.
- **Where it shows:**
  - **Payroll:** draft payslips use the new base.
  - **Reports → Staff performance:** the commission column shows only to HR/owner.
  - **My time & pay:** each specialist sees their own month so far, with a line-by-line breakdown.
- **Not changed:** approved or paid payslips.

### 3.2 Specialist discount

- **New permission** "Give discounts (up to a limit)", given to the Specialist role.
- **Cap:**
  - Settings → Discounts holds the cap, as a **% of the visit**: default **10%**, plus an optional SAR maximum.
  - It is set per role, and can be overridden per person in their HR file.
- **Where:**
  - On her own customer's card on the visit board, or on the appointment page: **"Give a discount"**, entered as a % or an amount, with a required reason (e.g. "Returning customer", "Session overran", "Introductory offer", or free text).
  - Allowed from consultation until checkout. Not allowed once the invoice is issued.
- **Within the cap:** it's saved on the appointment. When front desk opens the invoice it's already applied as the line discount, marked "Discount by [name]: [reason]".
- **Above the cap:**
  - It shows as **"Waiting for approval"**.
  - Managers get an in-app alert and approve or decline it from the visit board.
  - Front desk sees the pending flag at checkout.
- **Front desk / billing:** keeps unlimited discounts, as today, but every invoice discount now records who gave it and why, in the audit log.
- **Report:** Reports → **Discounts**: who, which customer, how much, why, and approved by whom.
- **R9:** apply the loyalty tier discount automatically, like the member discount (see Q4).

### 3.3 Roles: proposed matrix

✅ = has it today; ➕ = added; ➖ = removed.

| Permission | Owner | Admin | Manager | Reception | Specialist | Sales | Telesales | Marketing |
|---|---|---|---|---|---|---|---|---|
| View bookings & calendar | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| Manage bookings | ✅ | ✅ | ✅ | ✅ | | ✅ | ✅ | |
| View customers | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | |
| Manage customers & pipeline | ✅ | ✅ | ✅ | ✅ | | ✅ | ✅ | |
| Write notes & comments | ✅ | ✅ | ➕ | ➕ | ✅ | ➕ | ➕ | |
| Patient file (medical) | ✅ | ✅ | ✅ | | ✅ | | | |
| **Give discounts (capped)** — new | ✅ | ✅ | ✅ | | ➕ | | | |
| **Approve discounts** — new | ✅ | ✅ | ➕ | | | | | |
| Billing (invoices, payments) | ✅ | ✅ | ✅ | ✅ | | ✅ | | |
| Accounting | ✅ | ✅ | ✅ | | | | | |
| Inventory | ✅ | ✅ | ✅ | | | | | |
| **Catalog (services & prices)** | ✅ | ✅ | ✅ (now works) | | | | | ➖ (Q3) |
| Website content, media, journal | ✅ | ✅ | | | | | | ✅ |
| Reports & analytics | ✅ | ✅ | ✅ | | | ✅ | ✅ | ✅ |
| **Team pay figures (commission)** | ✅ | ✅ | via HR | | own only | own only | own only | |
| Marketing & campaigns | ✅ | ✅ | | | | | ✅ | ✅ |
| Users & roles | ✅ | ✅ | ✅ (can't grant more than they hold) | | | | | |
| HR & payroll | ✅ | ✅ | | | | | | |
| Settings | ✅ | ✅ | | | | | | |

**Code changes for the role bugs:**
- **R1:** services and departments → "Catalog". Website content, journal and media stay under "Content".
- **R4:** editing skin type and allergies → "Patient file".
- **R6:** issuing a gift card or assigning a package → "Billing". Defining packages stays under Settings.
- **R7:** the "sign at desk" consent screen → "Manage bookings". It shows only the form, no history.
- **R8:** Leads and Call-backs in the sidebar → "Manage customers".

**Specialist's menu after the change:**
- Dashboard, Visit board (My customers), Calendar, Waitlist (view), Customers, Consent forms, Chat assistant, Results gallery, and My time & pay with commission.
- Plus "Give a discount" on her own visits.

### 3.4 Out of scope

- Tiered or target-based commission (e.g. 10% above SAR 30k a month). The data model leaves room for it later.
- Commission for reception or sales on bookings they made.
- Splitting one service between two specialists.

## 4. Constraints

- **Live roles are in the database** and the owner may have edited them. The seed only ever *adds*. Applying this matrix to the live site is a data change (see Q5).
- **Payroll and ZATCA invoices already issued must not change.** The new base applies to draft payroll runs from now on.
- **Commission rules** follow common Saudi clinic practice: net of VAT and discounts, on collected revenue. The rates are the owner's decision.
- **Arabic:** all new text in Gulf Arabic, and the dictionary tests must stay green.

## 5. Build plan

1. **Permissions:**
   - Add `discount:give` and `discount:approve`.
   - Fix R1, R4, R6, R7 and R8 in code.
   - R2: role and user editors reject keys the editor doesn't hold.
   - R3: commission is hidden without HR.
   - Unit tests for each.
2. **Commission engine:**
   - Products % on the HR file; "Sold by" on invoice lines.
   - The new base (paid, net, excl. VAT, credit notes), wired into payroll drafts and the staff report.
   - Unit tests with discounts, unpaid invoices and refunds.
3. **My time & pay:** a commission card with this month and last month, line by line.
4. **Specialist discount:**
   - Fields on the appointment.
   - Cap settings, plus a per-person override in the HR file.
   - Give/approve/decline flow with the payment-style race guard.
   - Visit board and appointment page UI, manager alert, and invoice pre-fill.
   - Timeline entry.
5. **Discounts report** and an audit record on billing discounts; tier discount (R9).
6. **Roles migration** for the live database (per Q5), with the role matrix shown on /admin/roles.
7. **Tests and ship:**
   - e2e: a specialist gives a 5% discount, front desk checks out, and commission shows on My pay. A specialist asks for 20%, a manager approves.
   - A role crawler logs in as each role and checks its menu against the matrix.
   - Arabic crawler, RUNBOOK, deploy.

## 6. Open questions

- **Q1 — Commission rates:** one services % per specialist, or also a per-service override (e.g. laser 5%, facials 10%)? Do packages earn commission when sold, or per session used?
- **Q2 — Discount cap:** a default of 10% for specialists, with anything above going to a manager — right? Does the discount reduce the specialist's commission (recommended: yes, commission is on the net)?
- **Q3 — Marketing and prices:** take catalog and price editing away from Marketing (recommended), or keep it?
- **Q4 — Tier discount (R9):** apply loyalty-tier discounts automatically at billing, or remove the unused field?
- **Q5 — Live roles:** apply the new matrix to the live roles now (recommended, with a before/after list in the audit log), or only add the new permissions and leave the rest to the owner on the Roles page?
