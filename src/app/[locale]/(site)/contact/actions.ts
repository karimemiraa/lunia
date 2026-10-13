"use server";

import { getTranslations } from "next-intl/server";
import { createInquiry } from "@/modules/catalog/inquiries";
import { requestIp } from "@/lib/requestIp";
import { hitRateLimit } from "@/lib/rateLimit";

export interface ContactFormState {
  status: "idle" | "success" | "error";
  message?: string;
}

// Anti-abuse: a per-IP rate limit (below), a honeypot, and trimmed/capped
// field lengths before they ever reach validation.
const MAX_LENGTHS = { name: 200, phone: 40, email: 200, message: 4000, sourcePage: 200 } as const;

function readField(formData: FormData, key: string, max: number): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

// Server action backing the public contact form. No auth required (it's a
// public inquiry form) and no external send yet (email/WhatsApp notify is a
// later stage) — this only validates (via createInquiry's Zod schema) and
// persists a ContactInquiry row.
export async function submitInquiry(_prevState: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const localeRaw = readField(formData, "locale", 2);
  const locale = localeRaw === "en" ? "en" : "ar";
  const t = await getTranslations({ locale, namespace: "contact.form" });

  const name = readField(formData, "name", MAX_LENGTHS.name);
  const phone = readField(formData, "phone", MAX_LENGTHS.phone);
  const email = readField(formData, "email", MAX_LENGTHS.email);
  const message = readField(formData, "message", MAX_LENGTHS.message);
  const sourcePage = readField(formData, "sourcePage", MAX_LENGTHS.sourcePage);

  // Honeypot (the hidden "website" field): humans never fill it. Bots that do
  // get a quiet "success" so they don't retry, and nothing is persisted.
  if (readField(formData, "website", 200)) {
    return { status: "success", message: t("successMessage") };
  }

  // Per-IP cap: the form has no login, so stop scripted flooding.
  if (!(await hitRateLimit(`contact-ip:${await requestIp()}`, 8, 3600))) {
    return { status: "error", message: t("errorMessage") };
  }

  try {
    await createInquiry({
      name,
      phone,
      email: email || undefined,
      message,
      locale,
      sourcePage: sourcePage || undefined,
    });
    return { status: "success", message: t("successMessage") };
  } catch {
    return { status: "error", message: t("errorMessage") };
  }
}
