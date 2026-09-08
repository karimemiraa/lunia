// Real adapter for Twilio's Messages API (SMS and WhatsApp). Never throws:
// any HTTP error, network failure, or timeout resolves to {ok:false} so the
// outbox (src/modules/booking/outbox.ts) can record a FAILED delivery and
// move on.

import type { CommsSender } from "@/modules/booking/outbox";

export interface TwilioSenderConfig {
  accountSid: string;
  authToken: string;
  from: string;
}

const FETCH_TIMEOUT_MS = 10_000;

// Keeps a leading "+" (if present) and strips everything but digits
// elsewhere — E.164-shaped, the form Twilio expects for From/To.
function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/\D/g, "");
}

function base64Encode(input: string): string {
  // Buffer is available in both the Node runtime this worker/server code
  // runs in and in the Vitest (Node) test environment.
  return Buffer.from(input, "utf-8").toString("base64");
}

interface TwilioSendResponse {
  sid?: string;
}

export function makeTwilioSender(cfg: TwilioSenderConfig): CommsSender {
  return {
    async send(msg) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const isWhatsapp = msg.channel === "whatsapp";
        const from = normalizePhone(cfg.from);
        const to = normalizePhone(msg.toPhone);

        const params = new URLSearchParams({
          From: isWhatsapp ? `whatsapp:${from}` : from,
          To: isWhatsapp ? `whatsapp:${to}` : to,
          Body: msg.body,
        });

        const auth = base64Encode(`${cfg.accountSid}:${cfg.authToken}`);
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
          signal: controller.signal,
        });

        if (!res.ok) {
          return { ok: false };
        }

        const data = (await res.json()) as TwilioSendResponse;
        return data.sid ? { ok: true, providerRef: data.sid } : { ok: false };
      } catch {
        return { ok: false };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
