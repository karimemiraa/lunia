// Superadmin platform credentials store. Values live in the PlatformSecret
// table and are NEVER returned to the client raw — the UI receives only a
// masked hint (last 4 chars) and whether each field is set. getSecret() is
// server-only and used by future integration code (SMTP send, WhatsApp
// provider, payment gateway, AI chatbot). Nothing here performs a real
// integration; it only stores what the superadmin enters.

import { prisma } from "@/lib/db";

export interface SecretField {
  key: string;
  label: string;
  help?: string;
  /** true → masked in the UI (passwords/tokens); false → shown in full (host/port/ids). */
  secret: boolean;
  placeholder?: string;
}

export interface SecretGroup {
  id: string;
  title: string;
  description: string;
  fields: SecretField[];
}

// The fixed integration fields, grouped for the superadmin panel. Custom API
// credentials (arbitrary key/value) are handled separately with a "custom:"
// key prefix.
export const SECRET_GROUPS: SecretGroup[] = [
  {
    id: "email",
    title: "Email (SMTP)",
    description: "Outgoing email server for OTP codes, booking messages, and broadcasts.",
    fields: [
      { key: "SMTP_HOST", label: "SMTP host", secret: false, placeholder: "smtp.example.com" },
      { key: "SMTP_PORT", label: "SMTP port", secret: false, placeholder: "587" },
      { key: "SMTP_USER", label: "Username", secret: false },
      { key: "SMTP_PASS", label: "Password", secret: true },
      { key: "SMTP_FROM", label: "From address", secret: false, placeholder: "Lunia <no-reply@lunia.sa>" },
    ],
  },
  {
    id: "whatsapp",
    title: "WhatsApp",
    description: "Connect a WhatsApp Business provider to send and receive messages.",
    fields: [
      { key: "WHATSAPP_PROVIDER", label: "Provider", secret: false, placeholder: "meta / twilio / 360dialog" },
      { key: "WHATSAPP_PHONE_ID", label: "Phone number ID", secret: false },
      { key: "WHATSAPP_TOKEN", label: "Access token", secret: true },
      { key: "WHATSAPP_VERIFY_TOKEN", label: "Webhook verify token", secret: true },
    ],
  },
  {
    id: "payments",
    title: "Payments",
    description: "Payment gateway for online gift-card purchases and deposits.",
    fields: [
      { key: "PAYMENT_PROVIDER", label: "Provider", secret: false, placeholder: "moyasar / tap / hyperpay / stripe" },
      { key: "PAYMENT_PUBLIC_KEY", label: "Publishable key", secret: false },
      { key: "PAYMENT_SECRET_KEY", label: "Secret key", secret: true },
    ],
  },
  {
    id: "ai",
    title: "AI assistant",
    description: "Credentials for the on-site booking assistant (used when the chatbot is wired to a live model).",
    fields: [
      { key: "AI_PROVIDER", label: "Provider", secret: false, placeholder: "anthropic / openai" },
      { key: "AI_API_KEY", label: "API key", secret: true },
      { key: "AI_MODEL", label: "Model", secret: false, placeholder: "claude-opus-4-8" },
    ],
  },
];

const CUSTOM_PREFIX = "custom:";

function maskValue(value: string): string {
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

export interface SecretStatus {
  key: string;
  isSet: boolean;
  /** Masked hint for secret fields, or the full value for non-secret fields. */
  hint: string | null;
}

// Status of every fixed field: whether it's set, plus a hint (masked for
// secret fields, full value for non-secret ones like host/port/ids).
export async function getSecretsStatus(): Promise<Record<string, SecretStatus>> {
  const allKeys = SECRET_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
  const rows = await prisma.platformSecret.findMany({ where: { key: { in: allKeys } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const secretByKey = new Map(SECRET_GROUPS.flatMap((g) => g.fields).map((f) => [f.key, f.secret]));

  const out: Record<string, SecretStatus> = {};
  for (const key of allKeys) {
    const value = byKey.get(key);
    out[key] = {
      key,
      isSet: value != null && value.length > 0,
      hint: value == null || value.length === 0 ? null : secretByKey.get(key) ? maskValue(value) : value,
    };
  }
  return out;
}

export interface CustomCredential {
  name: string;
  hint: string;
}

// Custom API credentials the superadmin added (always masked).
export async function listCustomCredentials(): Promise<CustomCredential[]> {
  const rows = await prisma.platformSecret.findMany({ where: { key: { startsWith: CUSTOM_PREFIX } }, orderBy: { key: "asc" } });
  return rows.map((r) => ({ name: r.key.slice(CUSTOM_PREFIX.length), hint: maskValue(r.value) }));
}

// Upserts one credential value. An empty string clears (deletes) it.
export async function setSecret(key: string, value: string, updatedById?: string): Promise<void> {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    await prisma.platformSecret.deleteMany({ where: { key } });
    return;
  }
  await prisma.platformSecret.upsert({
    where: { key },
    update: { value: trimmed, updatedById: updatedById ?? null },
    create: { key, value: trimmed, updatedById: updatedById ?? null },
  });
}

const CUSTOM_NAME_RE = /^[A-Za-z0-9_.-]{1,60}$/;

export async function setCustomCredential(name: string, value: string, updatedById?: string): Promise<void> {
  const clean = name.trim();
  if (!CUSTOM_NAME_RE.test(clean)) throw new Error("Name must be letters, numbers, dot, dash or underscore (max 60).");
  await setSecret(`${CUSTOM_PREFIX}${clean}`, value, updatedById);
}

export async function deleteCustomCredential(name: string): Promise<void> {
  await prisma.platformSecret.deleteMany({ where: { key: `${CUSTOM_PREFIX}${name.trim()}` } });
}

// Server-only accessor for the actual secret value (for integration code).
export async function getSecret(key: string): Promise<string | null> {
  const row = await prisma.platformSecret.findUnique({ where: { key } });
  return row?.value ?? null;
}

// SMTP config assembled from the superadmin Email fields, or null if the
// required ones aren't all set. Lets the email sender use panel-entered
// credentials without any env vars or restart.
export async function getSmtpConfigFromSecrets(): Promise<{ host: string; port: number; user: string; pass: string; from: string } | null> {
  const rows = await prisma.platformSecret.findMany({
    where: { key: { in: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"] } },
  });
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const host = m.get("SMTP_HOST");
  const user = m.get("SMTP_USER");
  const pass = m.get("SMTP_PASS");
  const from = m.get("SMTP_FROM");
  if (!host || !user || !pass || !from) return null;
  const port = Number(m.get("SMTP_PORT")) || 587;
  return { host, port, user, pass, from };
}
