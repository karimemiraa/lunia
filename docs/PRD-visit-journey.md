# PRD: The in-clinic visit journey (رحلة العميلة داخل المركز)

Status: **approved 2026-10-16**, **shipped 2026-10-16** (operations notes: RUNBOOK §3.9)

Decisions:
- **Payment:** set per service. The default is pay at checkout. Services marked "pay before treatment" can't go to the room until paid (front desk can override, and the override is logged).
- **Consultation:** added automatically for a customer's first visit and for diagnostic services; staff can add or skip it.
- **Arrival alert:** in-app notification with a soft chime, plus a browser/phone notification. Nothing leaves the system.
- **Lobby screen:** none. The board is staff-only, and front desk calls customers in person.

## Problem

From the moment a customer walks in until she leaves, the system knows almost nothing. Today a booking only moves confirmed → checked in → started → completed.

- Nobody can see **how long she has been waiting**, or since when.
- The specialist is **not told** that her customer has arrived. Front desk walks over or calls.
- There's no record of **who took over at each step**: who checked her in, who received her, which room, who checked her out.
- Real steps in between have no place in the system:
  - a consultation before a first treatment
  - the room being prepared
  - paying and booking the next session at the desk
- The owner can't answer basic service questions: average wait, sessions that ran over, customers who waited more than 20 minutes.

## How a visit runs in a Saudi skin clinic (what we model)

1. **Expected (متوقعة اليوم).** On the list for today. Shows as *late* after the appointment time. If she doesn't come, the existing no-show flow takes over.
2. **Arrival at reception (الاستقبال).** Front desk checks her in. The system notes the time and who did it, and shows at a glance:
   - whether the health profile and consent forms are done (from the existing clinical module)
   - whether her ID/phone is verified
   - whether she has an unpaid balance
   - payment before treatment, if the clinic works that way (see Q1)
3. **Waiting (صالة الانتظار).** A live timer starts: "waiting 12 min". It turns amber at 10 minutes and red at 20 (both adjustable).
   - The assigned specialist is notified that her customer has arrived (see Q4).
   - An optional "hospitality served" tick (ضيافة: coffee, water) helps front desk keep track.
4. **Handoff (استلام).** The specialist taps "Receive". The waiting timer stops, and the record shows who took her and when.
   - If she isn't free, front desk can hand the customer to another available specialist. Reassigning only offers specialists who are free at that time.
5. **Consultation (الاستشارة)**, optional (see Q2). Assessment or skin analysis before treatment, with its own timer.
6. **In treatment (في غرفة العلاج).** Room and specialist shown, with a timer against the service's planned duration. "Running over" shows when it exceeds the plan.
7. **Treatment done.** The specialist taps "Finish".
   - The customer moves to **checkout**.
   - The room shows **being prepared (تجهيز الغرفة)** until it's marked ready, so the next customer isn't sent into an unprepared room.
   - The specialist is prompted to write the treatment record (existing module).
8. **Checkout (المحاسبة).** Payment through the existing billing (unless already paid), loyalty points, and **booking the next session before she leaves**, which is standard practice. A timer shows how long she has been at the desk.
9. **Left (غادرت).** The total visit time is recorded. The existing post-visit WhatsApp and review request follow.

## What the team sees

- **Live journey board** (front desk iPad/PC):
  - a page with one column per stage: Expected · Waiting · With specialist · In treatment · Checkout · Left today
  - each card shows the customer, service, specialist, room, the stage's live timer, warning colours, and the one next action button
  - the board refreshes itself every few seconds
  - it works in Arabic and English, like the rest of the admin
- **My customers** (for each specialist): who is waiting for her, who is next, with one-tap Receive / Finish. It's built for the phone in her pocket.
- **Room status**: free · occupied (who, until when) · being prepared.
- **The appointment page** shows the full visit timeline: arrived 10:02 (by Sara) → received 10:14 by Lina (waited 12 min) → room 2 at 10:16 → finished 11:01 → checked out 11:09 (by Sara) → total 67 min.
- **Reports** (Staff and Business):
  - average and longest wait
  - % of customers seen within 10 minutes
  - average treatment overrun
  - average time at checkout
  - each by day and by specialist

## Saudi-practice touches (on by default, can be switched off)

- **Prayer times:** the board shows the next prayer for Riyadh (e.g. «العصر بعد 15 دقيقة»), so the desk can plan around it. It is calculated on the server with the Umm al-Qura method, with no internet service needed.
- **Privacy:** on any screen facing the waiting room, customers appear as first name + initial («نورة ع.»), never with full names, phones or services.
- **Women-only staffing:** reassigning only offers specialists; nothing else changes.

## Out of scope

- Insurance claims (not used by this clinic).
- A self check-in kiosk or QR check-in. Possible later.
- Customer-facing live tracking ("you're next") by SMS. Possible later.

## Constraints

- **Booking statuses** (CONFIRMED → CHECKED_IN → COMPLETED / NO_SHOW) stay exactly as they are. Reports, billing and reminders depend on them. The journey adds detail inside "checked in" and doesn't replace it.
- **Live updates** use short polling, not websockets: simple, and reliable behind the current nginx setup.
- **Existing flows:** the calendar's Check in / Start / Complete buttons keep working and map onto the new stages, so nobody has to change habits on day one.

## Build plan

1. **Data:**
   - a `VisitEvent` timeline: booking, stage, time, staff member, note
   - a `currentStage` on the check-in record
   - room "being prepared" state
   - settings: thresholds, payment timing, consultation, prayer times
2. **Journey module:** transitions with permission and order checks, timers, reassign, room turnover, and the time metrics. Unit tests for every transition.
3. **Live board page, "My customers" view and room status.** Arabic first, with RTL.
4. **Wiring:** calendar buttons and the Today screen; arrival notification to the specialist; checkout links to billing and to "book next session".
5. **Visit timeline** on the appointment page, plus the report metrics.
6. **Tests and ship:** e2e walking a full visit in both languages, Arabic coverage crawler, runbook, deploy.
