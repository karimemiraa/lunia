"use server";

// Server actions for the customer's own patient-file pieces: the health
// questionnaire and consent signing. Like actions.ts, identity is always
// re-derived from the client-session cookie; nothing trusts a client-supplied
// clientProfileId.

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getClientSessionUser, CLIENT_SESSION_COOKIE } from "@/modules/iam/clientAuth";
import { submitIntake } from "@/modules/clinical/intake";
import { consentStatusForClient, signConsent } from "@/modules/clinical/consents";

type AccountLocale = "en" | "ar";
const asLocale = (locale: string): AccountLocale => (locale === "ar" ? "ar" : "en");

async function currentClientProfileId(): Promise<string | null> {
  const token = (await cookies()).get(CLIENT_SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await getClientSessionUser(token);
  if (!user) return null;
  const profile = await prisma.clientProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  return profile?.id ?? null;
}

// First hop of X-Forwarded-For (nginx sets it), else X-Real-IP. Recorded on
// the signature as evidence only; never used for access decisions.
async function requestIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || h.get("x-real-ip") || "").slice(0, 64) || null;
}

export type HealthSaveResult = { ok: true } | { ok: false; error: string };

export async function saveMyHealthProfile(locale: string, answers: unknown): Promise<HealthSaveResult> {
  const t = await getTranslations({ locale: asLocale(locale), namespace: "health.errors" });
  const clientProfileId = await currentClientProfileId();
  if (!clientProfileId) return { ok: false, error: t("notAuthenticated") };
  try {
    await submitIntake({ clientProfileId, answers, submittedBy: "CLIENT" });
  } catch {
    return { ok: false, error: t("generic") };
  }
  revalidatePath(`/${asLocale(locale)}/account`);
  return { ok: true };
}

export type ConsentSignActionResult = { ok: true; signatureId: string } | { ok: false; error: string };

export async function signMyConsent(
  formId: string,
  locale: string,
  input: { signerName: string; signatureData: string },
): Promise<ConsentSignActionResult> {
  const loc = asLocale(locale);
  const t = await getTranslations({ locale: loc, namespace: "consents.sign.errors" });
  const clientProfileId = await currentClientProfileId();
  if (!clientProfileId) return { ok: false, error: t("notAuthenticated") };

  // Only forms currently offered to this client (required or optional) can be
  // signed from the account; tie the signature to the booking that needs it.
  const status = (await consentStatusForClient(clientProfileId)).find((row) => row.formId === formId);
  if (!status) return { ok: false, error: t("notFound") };

  try {
    const signature = await signConsent({
      clientProfileId,
      consentFormId: formId,
      signerName: input?.signerName,
      signatureData: input?.signatureData,
      locale: loc,
      bookingId: status.bookingIds[0] ?? null,
      ip: await requestIp(),
    });
    revalidatePath(`/${loc}/account`);
    return { ok: true, signatureId: signature.id };
  } catch {
    return { ok: false, error: t("generic") };
  }
}
