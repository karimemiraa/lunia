// Real adapter for the Meta WhatsApp Cloud API. Sends a plain-text WhatsApp
// message via POST /{phoneId}/messages. Never throws: any HTTP error,
// network failure, or timeout resolves to {ok:false} so the outbox
// (src/modules/booking/outbox.ts) can record a FAILED delivery and move on.

import type { CommsSender } from "@/modules/booking/outbox";

export interface MetaSenderConfig {
  token: string;
  phoneId: string;
  // Not used by the Cloud API today (the sending number is implied by
  // phoneId), but carried through for parity with the other adapters and
  // for a future template-message path that may want to log/select by from.
  from?: string;
}

const GRAPH_API_VERSION = "v21.0";
const FETCH_TIMEOUT_MS = 10_000;

// Keeps a leading "+" (if present) and strips everything but digits
// elsewhere — the shape the Graph API expects for `to`.
function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/\D/g, "");
}

interface MetaSendResponse {
  messages?: Array<{ id?: string }>;
}

export function makeMetaSender(cfg: MetaSenderConfig): CommsSender {
  return {
    async send(msg) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        // TODO: when msg carries a providerTemplateName (a future extension
        // of the CommsSender input, resolved from src/modules/comms
        // templates), send a {type:"template", template:{name,...}} body
        // instead of plain text. Plain text is sufficient for now — dev/test
        // never route through a real adapter (see sender.ts's selection
        // rule), so no caller currently needs the template path.
        const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${cfg.phoneId}/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfg.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: normalizePhone(msg.toPhone),
            type: "text",
            text: { body: msg.body },
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          return { ok: false };
        }

        const data = (await res.json()) as MetaSendResponse;
        const id = data.messages?.[0]?.id;
        return id ? { ok: true, providerRef: id } : { ok: false };
      } catch {
        // Network failure, timeout/abort, or unparseable response — never
        // throw out of a CommsSender.
        return { ok: false };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
