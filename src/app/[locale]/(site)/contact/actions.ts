"use server";

import { getTranslations } from "next-intl/server";
import { createInquiry } from "@/modules/catalog/inquiries";

export interface ContactFormState {
  status: "idle" | "success" | "error";
  message?: string;
}

// Basic anti-abuse for now (real rate limiting is a later hardening stage):
// trim whitespace and cap field lengths before they ever reach validation.
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
