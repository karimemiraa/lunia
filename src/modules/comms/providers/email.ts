// Real email adapter over SMTP (nodemailer). Never throws: any transport
// error, timeout, or rejection resolves to {ok:false} so the outbox / OTP
// flow can record a FAILED delivery and move on. Credentials (auth.pass) are
// never logged. Server-only (SMTP), so nothing here affects the CSP.

import nodemailer from "nodemailer";
import type { CommsSender } from "@/modules/booking/outbox";
import { renderEmailHtml } from "@/modules/comms/emailLayout";

export interface EmailSenderConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

const TIMEOUT_MS = 10_000;

export function makeEmailSender(cfg: EmailSenderConfig): CommsSender {
  // Port 465 is implicit TLS ("secure"); 587/25 use STARTTLS (secure:false).
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  });

  return {
    async send(msg) {
      if (!msg.toEmail) return { ok: false };
      try {
        const subject = msg.subject && msg.subject.trim() ? msg.subject : "Lunia";
        const info = await transport.sendMail({
          from: cfg.from,
          to: msg.toEmail,
          subject,
          text: msg.body,
          // Branded HTML alongside the plain-text fallback.
          html: renderEmailHtml({
            subject,
            body: msg.body,
            recipientName: msg.recipientName,
            locale: msg.locale,
          }),
        });
        // A real send always yields a messageId; treat its absence as failure
        // so "SENT" always means the SMTP server accepted the message.
        const messageId = info?.messageId;
        if (!messageId) return { ok: false };
        return { ok: true, providerRef: messageId };
      } catch {
        // Deliberately swallow the error object (it can echo connection
        // details); never log cfg.pass.
        return { ok: false };
      }
    },
  };
}
