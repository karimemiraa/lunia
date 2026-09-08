// Real adapter for Unifonic's REST SMS send API. Never throws: any HTTP
// error, network failure, or timeout resolves to {ok:false} so the outbox
// (src/modules/booking/outbox.ts) can record a FAILED delivery and move on.

import type { CommsSender } from "@/modules/booking/outbox";

export interface UnifonicSenderConfig {
  appSid: string;
  senderId: string;
}

const FETCH_TIMEOUT_MS = 10_000;

// Unifonic's Recipient field expects digits only (no leading "+").
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

interface UnifonicSendResponse {
  data?: { MessageID?: string };
  MessageID?: string;
}

export function makeUnifonicSender(cfg: UnifonicSenderConfig): CommsSender {
  return {
    async send(msg) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const params = new URLSearchParams({
          AppSid: cfg.appSid,
          SenderID: cfg.senderId,
          Body: msg.body,
          Recipient: normalizePhone(msg.toPhone),
        });

        const res = await fetch("https://el.cloud.unifonic.com/rest/SMS/messages", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
          signal: controller.signal,
        });

        if (!res.ok) {
          return { ok: false };
        }

        const data = (await res.json()) as UnifonicSendResponse;
        const messageId = data.data?.MessageID ?? data.MessageID;
        const providerRef = messageId ?? `unifonic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        return { ok: true, providerRef };
      } catch {
        return { ok: false };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
