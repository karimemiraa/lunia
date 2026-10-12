# Ask Lunia: the team assistant

A help center inside the staff admin. It opens from the floating **Ask Lunia** button at the bottom of every admin page (mounted in `src/app/admin/layout.tsx`, so the chat stays open across page changes).

## What it does

| Staff ask… | It… |
|---|---|
| "open payroll", "افتح الفواتير" | navigates to the page (only pages their role and the owner's menu settings allow) |
| "add a new lead", "book Sara", "new invoice for Noura" | opens the form pre-filled (`/admin/clients?add=lead`, `/admin/calendar?add=1&name=&phone=`, `/admin/billing/new?client=`). It never saves anything itself. |
| "how do I issue a refund?", "كيف أطلب إجازة؟" | shows a step-by-step guide that uses the real button labels, plus links |
| "revenue this month", "unpaid invoices", "appointments yesterday" | answers with live numbers from the database, in Riyadh time |
| "request an edit", "طلب تعديل" | shows a form; the request goes to **System → Edit requests** (`/admin/requests`) |
| "my requests" | shows the status of their requests and the owner's reply |

## Two engines

1. **Built-in engine** (`src/modules/staffAssistant/rules.ts`). Always available, no API key needed. It understands English and Arabic phrasing using keyword and intent rules.
2. **Claude** (`src/modules/staffAssistant/ai.ts`). Active only when an Anthropic API key is set. It answers free-form questions, combines several lookups, and replies in the user's language.
   - **Turn it on:** Superadmin (`/superadmin`, "Platform & Integrations") → *Team assistant (Ask Lunia)* → paste the key from console.anthropic.com. As a fallback, it also reads the `ANTHROPIC_API_KEY` env var.
   - **Turn it off:** clear the field.
   - If a Claude call fails (network, quota, anything), that question is answered by the built-in engine instead.
   - Model: `claude-opus-5-5`, effort `medium`. The system prompt and tools are cached.
   - **Server-side refusal fallbacks are enabled** (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`). If the model declines a request, the API may retry it on a fallback model.

### Why the numbers can be trusted

Both engines use the **same read-only tools** (`src/modules/staffAssistant/tools.ts`), and every figure comes from those tools:

- Claude is told never to estimate. Tool figures are shown in the panel as their own stat cards, separate from the model's text.
- Each tool declares the permissions it needs. Claude is only given the tools the user's role allows, and `runTool` checks the permission again on every call.
- `unpaid_invoices` uses `receivablesAging()` from the accounting module, so it matches the Accounting receivables report. It is net of payments and of credit notes.
- `revenue_summary`:
  - **Collected:** completed payments in the period. Refunds are stored as negative payments, so the sum is already net of them. Failed payments are excluded.
  - **Invoiced:** invoices minus credit notes, by issue date.

## Edit requests

- **Table:** `EditRequest`, migration `20261013090000_edit_requests`.
- **Who can do what:**
  - Any staff member can file one from the assistant. The page they filed it from is saved with it.
  - Owners (`SETTINGS_MANAGE`) triage requests at `/admin/requests`: Open → In progress → Done / Declined, with an optional reply.
- **Notifications and audit:**
  - Open requests appear in the owners' notification bell.
  - Status changes are written to the audit log.

## Extending it

- **New how-to guide:** add an entry to `GUIDES` in `src/modules/staffAssistant/help.ts`. Put the exact UI labels in “curly quotes”. `tests/staffAssistant/engine.test.ts` fails if a quoted label isn't in the admin source, or if a link points to a route that doesn't exist.
- **New number:** add a tool to `TOOLS` in `tools.ts`, with a zod input, `anyOf` permissions and `run()`. Claude picks it up automatically. For the built-in engine, add a regex to `METRICS` in `rules.ts`.
- **New page synonym:** add it to `SYNONYMS` or `EXTRA_PAGES` in `navigation.ts`.

## Tests

- `tests/staffAssistant/engine.test.ts`: text matching (Arabic folding), Riyadh periods, navigation and permission filtering, guide label/route checks, and built-in intents in English and Arabic.
- `tests/staffAssistant/tools.test.ts`: exact figures against rows created in March 2033 (refunds, failed payments, credit notes), permission denial, and the edit-request lifecycle.
- `tests/staffAssistant/ai.test.ts`: the Claude loop with a scripted fake client. Covers the request shape, role-filtered tools, parallel tool results returned by id, `is_error`, the round cap, refusal, `pause_turn`, and the fallback to the built-in engine.
- `e2e/admin-assistant.spec.ts`: the real panel in a browser. Covers numbers, navigation that keeps the chat, a guide, the pre-filled Add lead form, and an edit request from filing → inbox → Done → reply visible to the requester.

## Known limits

- The built-in engine's replies, and the guides, are in English, even when the question is in Arabic. Admin page content is English too. With Claude connected, answers come back in Arabic.
- Chat history is kept per browser (`localStorage`) and is not synced across devices.
