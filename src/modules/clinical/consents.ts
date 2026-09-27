// Consent-form templates and e-signatures. A template's text can change over
// time (editing the text bumps `version`); every signature stores a snapshot
// of the exact text and the version the client agreed to, so a signed consent
// is never rewritten by a later edit.

import { z } from "zod";
import { prisma } from "@/lib/db";
import { CONSENT_KEYS, DEFAULT_CONSENT_TEMPLATES } from "./consentDefaults";

export { CONSENT_KEYS };

// --- Templates -----------------------------------------------------------------

export const consentFormSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,59}$/, "Key: lowercase letters, numbers and dashes"),
  titleEn: z.string().trim().min(1).max(200),
  titleAr: z.string().trim().min(1).max(200),
  bodyEn: z.string().trim().min(1).max(20_000),
  bodyAr: z.string().trim().min(1).max(20_000),
  serviceIds: z.array(z.string().min(1)).max(100).default([]),
  isActive: z.boolean().default(true),
});
export type ConsentFormInput = z.input<typeof consentFormSchema>;

export async function listConsentForms() {
  return prisma.consentForm.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    include: { _count: { select: { signatures: true } } },
  });
}

export async function getConsentForm(id: string) {
  return prisma.consentForm.findUnique({ where: { id } });
}

/** Seeds the default templates, only when the table is empty. Returns how many were created. */
export async function ensureDefaultConsentForms(): Promise<number> {
  if ((await prisma.consentForm.count()) > 0) return 0;
  const slugs = DEFAULT_CONSENT_TEMPLATES.flatMap((t) => t.serviceSlugs);
  const services = slugs.length
    ? await prisma.service.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } })
    : [];
  const idBySlug = new Map(services.map((s) => [s.slug, s.id]));
  let created = 0;
  for (const t of DEFAULT_CONSENT_TEMPLATES) {
    // upsert-by-key keeps two concurrent first visits from colliding.
    const existing = await prisma.consentForm.findUnique({ where: { key: t.key } });
    if (existing) continue;
    await prisma.consentForm.create({
      data: {
        key: t.key,
        titleEn: t.titleEn,
        titleAr: t.titleAr,
        bodyEn: t.bodyEn,
        bodyAr: t.bodyAr,
        serviceIds: t.serviceSlugs.map((s) => idBySlug.get(s)).filter((id): id is string => Boolean(id)),
      },
    });
    created += 1;
  }
  return created;
}

export async function createConsentForm(input: ConsentFormInput) {
  const data = consentFormSchema.parse(input);
  return prisma.consentForm.create({ data });
}

/**
 * Updates a template. Any change to the wording (titles or bodies) bumps the
 * version, so existing signatures are shown as "signed an older version" and
 * the client is asked to sign again. Linked services / active flag do not.
 */
export async function updateConsentForm(id: string, input: ConsentFormInput) {
  const data = consentFormSchema.parse(input);
  const current = await prisma.consentForm.findUnique({ where: { id } });
  if (!current) throw new Error("Consent form not found");
  const textChanged =
    current.titleEn !== data.titleEn ||
    current.titleAr !== data.titleAr ||
    current.bodyEn !== data.bodyEn ||
    current.bodyAr !== data.bodyAr;
  return prisma.consentForm.update({
    where: { id },
    data: { ...data, version: textChanged ? current.version + 1 : current.version },
  });
}

// --- Signing -------------------------------------------------------------------

// A drawn signature from the canvas. Capped so a crafted request can't stuff
// megabytes into a text column (a real signature PNG is ~5-60KB).
const MAX_SIGNATURE_CHARS = 500_000;
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

export const signConsentSchema = z.object({
  clientProfileId: z.string().min(1),
  consentFormId: z.string().min(1),
  signerName: z.string().trim().min(2).max(120),
  signatureData: z
    .string()
    .max(MAX_SIGNATURE_CHARS, "Signature image is too large")
    .regex(PNG_DATA_URL, "Signature must be a PNG image"),
  locale: z.enum(["ar", "en"]).default("ar"),
  bookingId: z.string().min(1).optional().nullable(),
  witnessUserId: z.string().min(1).optional().nullable(),
  ip: z.string().max(64).optional().nullable(),
});
export type SignConsentInput = z.input<typeof signConsentSchema>;

/** The exact text a client sees and signs, in their language. */
export function consentSnapshot(form: { titleEn: string; titleAr: string; bodyEn: string; bodyAr: string }, locale: "ar" | "en"): string {
  return locale === "ar" ? `${form.titleAr}\n\n${form.bodyAr}` : `${form.titleEn}\n\n${form.bodyEn}`;
}

/**
 * Records a signature against the form's CURRENT version with a snapshot of
 * its text. Signing the general treatment consent stamps
 * ClientProfile.consentTreatmentAt; signing the photography consent stamps
 * consentDataAt (the PDPL data/imaging consent).
 */
export async function signConsent(input: SignConsentInput) {
  const data = signConsentSchema.parse(input);
  const form = await prisma.consentForm.findUnique({ where: { id: data.consentFormId } });
  if (!form || !form.isActive) throw new Error("This consent form is not available");

  if (data.bookingId) {
    const booking = await prisma.booking.findUnique({ where: { id: data.bookingId }, select: { clientProfileId: true } });
    if (!booking || booking.clientProfileId !== data.clientProfileId) throw new Error("Booking not found");
  }

  return prisma.$transaction(async (tx) => {
    const signature = await tx.consentSignature.create({
      data: {
        clientProfileId: data.clientProfileId,
        consentFormId: form.id,
        formVersion: form.version,
        bodySnapshot: consentSnapshot(form, data.locale),
        signerName: data.signerName,
        signatureData: data.signatureData,
        locale: data.locale,
        bookingId: data.bookingId ?? null,
        witnessUserId: data.witnessUserId ?? null,
        ip: data.ip ?? null,
      },
    });
    const stamp =
      form.key === CONSENT_KEYS.GENERAL
        ? { consentTreatmentAt: signature.signedAt }
        : form.key === CONSENT_KEYS.PHOTOGRAPHY
          ? { consentDataAt: signature.signedAt }
          : null;
    if (stamp) await tx.clientProfile.update({ where: { id: data.clientProfileId }, data: stamp });
    return signature;
  });
}

export async function getSignature(id: string) {
  return prisma.consentSignature.findUnique({ where: { id }, include: { consentForm: true } });
}

export async function listSignatures(clientProfileId: string) {
  return prisma.consentSignature.findMany({
    where: { clientProfileId },
    orderBy: { signedAt: "desc" },
    select: {
      id: true,
      consentFormId: true,
      formVersion: true,
      signerName: true,
      locale: true,
      bookingId: true,
      witnessUserId: true,
      signedAt: true,
      consentForm: { select: { key: true, titleEn: true, titleAr: true, version: true } },
    },
  });
}

// --- Status for a client -------------------------------------------------------

export interface ConsentStatusRow {
  formId: string;
  key: string;
  titleEn: string;
  titleAr: string;
  version: number;
  required: boolean;
  /** Upcoming booking ids whose services require this form. */
  bookingIds: string[];
  lastSignatureId: string | null;
  lastSignedAt: Date | null;
  lastSignedVersion: number | null;
  /** Signed at the current version. */
  upToDate: boolean;
}

const UPCOMING_STATUSES = ["REQUESTED", "CONFIRMED", "CHECKED_IN"] as const;

/**
 * Which active forms this client should have signed: the general treatment
 * consent always, plus every form linked to a service on one of their
 * upcoming bookings (required); forms linked to no service (e.g. photography)
 * are listed as optional. Forms linked only to services they have not booked
 * are omitted.
 */
export async function consentStatusForClient(clientProfileId: string, now: Date = new Date()): Promise<ConsentStatusRow[]> {
  const [forms, upcoming, signatures] = await Promise.all([
    prisma.consentForm.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    prisma.appointment.findMany({
      where: { startAt: { gte: now }, booking: { clientProfileId, status: { in: [...UPCOMING_STATUSES] } } },
      select: { serviceId: true, bookingId: true },
    }),
    prisma.consentSignature.findMany({
      where: { clientProfileId },
      orderBy: { signedAt: "desc" },
      select: { id: true, consentFormId: true, formVersion: true, signedAt: true },
    }),
  ]);

  const rows: ConsentStatusRow[] = [];
  for (const form of forms) {
    const bookingIds = [...new Set(upcoming.filter((a) => form.serviceIds.includes(a.serviceId)).map((a) => a.bookingId))];
    const isGeneral = form.key === CONSENT_KEYS.GENERAL;
    const linked = form.serviceIds.length > 0;
    if (linked && bookingIds.length === 0) continue;
    const last = signatures.find((s) => s.consentFormId === form.id) ?? null;
    rows.push({
      formId: form.id,
      key: form.key,
      titleEn: form.titleEn,
      titleAr: form.titleAr,
      version: form.version,
      required: isGeneral || linked,
      bookingIds,
      lastSignatureId: last?.id ?? null,
      lastSignedAt: last?.signedAt ?? null,
      lastSignedVersion: last?.formVersion ?? null,
      upToDate: Boolean(last && last.formVersion === form.version),
    });
  }
  return rows.sort((a, b) => Number(b.required) - Number(a.required));
}
