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

// Unifonic's REST API returns HTTP 200 even for logical failures (invalid
// recipient, insufficient balance, bad AppSid) with a body like
// {"success":"false","errorCode":...,"message":...}. So HTTP 2xx alone does
// NOT mean the message was accepted -- we must inspect `success` and require a
// real MessageID before reporting {ok:true}.
interface UnifonicSendResponse {
  success?: string | boolean;
  errorCode?: string | number;
  message?: string;
  data?: { MessageID?: string };
  MessageID?: string;
}

// Unifonic reports success as the string "true" (occasionally a real boolean).
// Anything else -- "false", missing, or unexpected -- is a failure.
function isSuccessFlag(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().toLowerCase() === "true";
  return false;
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

        // A logical failure returned as HTTP 200. If `success` is present it is
        // authoritative; treat an explicit non-"true" value as a rejection.
        if (data.success !== undefined && !isSuccessFlag(data.success)) {
          return { ok: false };
        }

        // "SENT" must always mean a real provider id exists -- never synthesize
        // one, or a rejected send would be recorded as delivered.
        const messageId = data.data?.MessageID ?? data.MessageID;
        if (!messageId) {
          return { ok: false };
        }
        return { ok: true, providerRef: messageId };
      } catch {
        return { ok: false };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
