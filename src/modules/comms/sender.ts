// Sender selection: decides WHICH CommsSender implementation
// processDueMessages() (src/modules/booking/outbox.ts) should use, based on
// runtime environment + comms provider config. No real sends happen here —
// this module only picks between the logging-only stubSender and a real
// provider adapter (Task 3 fills in the adapters' bodies; see
// src/modules/comms/providers/index.ts).
//
// Selection rule (both getConfiguredSender and getSmsSender): outside
// nodeEnv "production", or when the relevant provider isn't fully
// configured, always fall back to stubSender. This keeps local dev, CI, and
// any non-production deploy from ever attempting a real outbound send, even
// if comms env vars happen to be set there.

import type { CommsSender } from "@/modules/booking/outbox";
import { stubSender } from "@/modules/booking/outbox";
import type { EnvSource } from "@/modules/comms/config";
import { getCommsConfig } from "@/modules/comms/config";
import { makeSender } from "@/modules/comms/providers";
import { makeEmailSender } from "@/modules/comms/providers/email";

// General-purpose sender (used for WhatsApp-first channels like
// CONFIRMATION/REMINDER_24H/POST_VISIT). Returns stubSender unless running
// in production with a fully configured provider.
export function getConfiguredSender(
  env: EnvSource = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): CommsSender {
  const config = getCommsConfig(env);
  if (nodeEnv !== "production" || !config.configured) {
    return stubSender;
  }
  return makeSender(config);
}

// SMS-capable sender: only unifonic and twilio send SMS (meta_whatsapp does
// not), so this only returns a real adapter when the configured provider is
// one of those two. Returns stubSender outside production, when provider is
// "none"/unconfigured, or when the configured provider is meta_whatsapp
// (not SMS-capable).
export function getSmsSender(
  env: EnvSource = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): CommsSender {
  const config = getCommsConfig(env);
  const smsCapable = config.provider === "unifonic" || config.provider === "twilio";
  if (nodeEnv !== "production" || !config.configured || !smsCapable) {
    return stubSender;
  }
  return makeSender(config);
}

// Email (SMTP) sender: returns a real nodemailer adapter only in production
// with SMTP fully configured; the logging-only stub everywhere else.
export function getEmailSender(
  env: EnvSource = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): CommsSender {
  const config = getCommsConfig(env);
  if (nodeEnv !== "production" || !config.emailConfigured || !config.email) {
    return stubSender;
  }
  return makeEmailSender(config.email);
}

// Routes to the right sender for a delivery channel. "email" -> SMTP;
// "sms" -> SMS-capable provider; anything else (whatsapp/none) -> the general
// configured sender. Each returns the logging stub unless prod + configured.
//
// Async because the email path also honours SMTP credentials entered in the
// superadmin panel (PlatformSecret) — so email can be enabled at runtime
// without env vars or a restart. Env SMTP still wins when present.
export async function resolveSenderForChannel(
  channel: string,
  env: EnvSource = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): Promise<CommsSender> {
  if (channel === "sms") return getSmsSender(env, nodeEnv);
  if (channel !== "email") return getConfiguredSender(env, nodeEnv);

  // Email: env SMTP first, then superadmin-panel SMTP, else the stub.
  const config = getCommsConfig(env);
  if (nodeEnv !== "production") return stubSender;
  if (config.emailConfigured && config.email) return makeEmailSender(config.email);
  const { getSmtpConfigFromSecrets } = await import("@/modules/platform/secrets");
  const fromSecrets = await getSmtpConfigFromSecrets().catch(() => null);
  if (fromSecrets) return makeEmailSender(fromSecrets);
  return stubSender;
}
