// Comms provider configuration. All of this is read from OPTIONAL env vars
// (never from src/lib/env.ts's strict schema — comms creds are only needed
// once a client actually wants real WhatsApp/SMS sending; local dev and CI
// never set them). getCommsConfig() NEVER throws: an unset or malformed env
// simply resolves to provider "none" / configured=false, which sender.ts
// then maps to the logging-only stubSender.

export type CommsProvider = "none" | "meta_whatsapp" | "twilio" | "unifonic";
export type BookingChannel = "whatsapp" | "sms";

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export interface CommsConfig {
  provider: CommsProvider;
  from?: string;
  meta?: { token: string; phoneId: string };
  twilio?: { accountSid: string; authToken: string; from: string };
  unifonic?: { appSid: string; senderId: string };
  configured: boolean;
  // Email (SMTP) is independent of the WhatsApp/SMS `provider`: it can be
  // configured on its own, so it has its own `emailConfigured` flag.
  email?: EmailConfig;
  emailConfigured: boolean;
  // Explicit override for the channel booking messages are sent on. When
  // unset, the channel is derived from the provider (see resolveBookingChannel
  // in outbox.ts) — e.g. a Twilio account provisioned for SMS rather than
  // WhatsApp sets COMMS_BOOKING_CHANNEL=sms.
  bookingChannel?: BookingChannel;
}

// A minimal, injectable stand-in for process.env: any object mapping env
// var names to (possibly undefined) strings. Using this instead of
// NodeJS.ProcessEnv lets tests pass small partial objects (e.g. {}, or just
// {COMMS_PROVIDER: "..."}) without satisfying process.env's full shape.
export type EnvSource = Record<string, string | undefined>;

const PROVIDER_VALUES: readonly CommsProvider[] = ["none", "meta_whatsapp", "twilio", "unifonic"];

function isCommsProvider(value: string | undefined): value is CommsProvider {
  return value !== undefined && (PROVIDER_VALUES as readonly string[]).includes(value);
}

// Trims to undefined for "", so a blank env var reads the same as an unset
// one rather than as a present-but-empty credential.
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

// Reads comms provider config from `env` (an injectable stand-in for
// process.env, so tests never touch the real process.env). Unknown/unset
// COMMS_PROVIDER falls back to "none". `configured` is true only when the
// selected provider's full set of required creds is present.
export function getCommsConfig(env: EnvSource = process.env): CommsConfig {
  const rawProvider = nonEmpty(env.COMMS_PROVIDER);
  const provider: CommsProvider = isCommsProvider(rawProvider) ? rawProvider : "none";
  const from = nonEmpty(env.COMMS_FROM);

  const metaToken = nonEmpty(env.META_WA_TOKEN);
  const metaPhoneId = nonEmpty(env.META_WA_PHONE_ID);
  const meta = metaToken && metaPhoneId ? { token: metaToken, phoneId: metaPhoneId } : undefined;

  const twilioSid = nonEmpty(env.TWILIO_ACCOUNT_SID);
  const twilioToken = nonEmpty(env.TWILIO_AUTH_TOKEN);
  const twilioFrom = nonEmpty(env.TWILIO_FROM);
  const twilio =
    twilioSid && twilioToken && twilioFrom ? { accountSid: twilioSid, authToken: twilioToken, from: twilioFrom } : undefined;

  const unifonicAppSid = nonEmpty(env.UNIFONIC_APP_SID);
  const unifonicSenderId = nonEmpty(env.UNIFONIC_SENDER_ID);
  const unifonic = unifonicAppSid && unifonicSenderId ? { appSid: unifonicAppSid, senderId: unifonicSenderId } : undefined;

  const configured =
    (provider === "meta_whatsapp" && meta !== undefined) ||
    (provider === "twilio" && twilio !== undefined) ||
    (provider === "unifonic" && unifonic !== undefined);

  const rawChannel = nonEmpty(env.COMMS_BOOKING_CHANNEL)?.toLowerCase();
  const bookingChannel: BookingChannel | undefined =
    rawChannel === "whatsapp" || rawChannel === "sms" ? rawChannel : undefined;

  // Email (SMTP) — configured independently of the WhatsApp/SMS provider.
  const smtpHost = nonEmpty(env.SMTP_HOST);
  const smtpUser = nonEmpty(env.SMTP_USER);
  const smtpPass = nonEmpty(env.SMTP_PASS);
  const smtpFrom = nonEmpty(env.COMMS_EMAIL_FROM);
  const smtpPortRaw = nonEmpty(env.SMTP_PORT);
  const smtpPort = smtpPortRaw && /^\d+$/.test(smtpPortRaw) ? Number(smtpPortRaw) : 587;
  const email: EmailConfig | undefined =
    smtpHost && smtpUser && smtpPass && smtpFrom
      ? { host: smtpHost, port: smtpPort, user: smtpUser, pass: smtpPass, from: smtpFrom }
      : undefined;
  const emailConfigured = email !== undefined;

  return { provider, from, meta, twilio, unifonic, configured, bookingChannel, email, emailConfigured };
}
