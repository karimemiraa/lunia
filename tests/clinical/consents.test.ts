import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  CONSENT_KEYS,
  consentStatusForClient,
  createConsentForm,
  ensureDefaultConsentForms,
  signConsent,
  updateConsentForm,
} from "@/modules/clinical/consents";
import { cleanupUsers, makeClient, TINY_PNG_DATA_URL } from "./helpers";

const users: string[] = [];
const formIds: string[] = [];

afterAll(async () => {
  await prisma.consentSignature.deleteMany({ where: { consentFormId: { in: formIds } } });
  await prisma.consentSignature.deleteMany({ where: { client: { userId: { in: users } } } });
  await prisma.consentForm.deleteMany({ where: { id: { in: formIds } } });
  await cleanupUsers(users);
});

async function client() {
  const c = await makeClient();
  users.push(c.userId);
  return c;
}

async function tempForm() {
  const form = await createConsentForm({
    key: `test-form-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    titleEn: "Test consent",
    titleAr: "موافقة اختبار",
    bodyEn: "Original English text.",
    bodyAr: "النص الأصلي.",
  });
  formIds.push(form.id);
  return form;
}

describe("consent versions and snapshots", () => {
  it("snapshots the exact signed text and version, and keeps it after the form is edited", async () => {
    const { clientProfileId } = await client();
    const form = await tempForm();
    expect(form.version).toBe(1);

    const sig = await signConsent({ clientProfileId, consentFormId: form.id, signerName: "Test Signer", signatureData: TINY_PNG_DATA_URL, locale: "en" });
    expect(sig.formVersion).toBe(1);
    expect(sig.bodySnapshot).toBe("Test consent\n\nOriginal English text.");

    const edited = await updateConsentForm(form.id, { ...form, bodyEn: "Changed English text." });
    expect(edited.version).toBe(2);

    const stored = await prisma.consentSignature.findUniqueOrThrow({ where: { id: sig.id } });
    expect(stored.formVersion).toBe(1);
    expect(stored.bodySnapshot).toContain("Original English text.");

    const arSig = await signConsent({ clientProfileId, consentFormId: form.id, signerName: "Test Signer", signatureData: TINY_PNG_DATA_URL, locale: "ar" });
    expect(arSig.formVersion).toBe(2);
    expect(arSig.bodySnapshot).toBe("موافقة اختبار\n\nالنص الأصلي.");
  });

  it("does not bump the version when only services or the active flag change", async () => {
    const form = await tempForm();
    const service = await prisma.service.findFirstOrThrow();
    const updated = await updateConsentForm(form.id, { ...form, serviceIds: [service.id], isActive: false });
    expect(updated.version).toBe(1);
  });

  it("rejects a signature that is not a PNG data URL", async () => {
    const { clientProfileId } = await client();
    const form = await tempForm();
    await expect(
      signConsent({ clientProfileId, consentFormId: form.id, signerName: "Test Signer", signatureData: "data:text/html;base64,PHNjcmlwdD4=" }),
    ).rejects.toThrow();
  });
});

describe("signing sets consent timestamps", () => {
  it("general treatment consent stamps consentTreatmentAt; photography stamps consentDataAt", async () => {
    await ensureDefaultConsentForms();
    const general = await prisma.consentForm.findUniqueOrThrow({ where: { key: CONSENT_KEYS.GENERAL } });
    const photo = await prisma.consentForm.findUniqueOrThrow({ where: { key: CONSENT_KEYS.PHOTOGRAPHY } });
    const { clientProfileId } = await client();

    const before = await prisma.clientProfile.findUniqueOrThrow({ where: { id: clientProfileId } });
    expect(before.consentTreatmentAt).toBeNull();
    expect(before.consentDataAt).toBeNull();

    const s1 = await signConsent({ clientProfileId, consentFormId: general.id, signerName: "Test Signer", signatureData: TINY_PNG_DATA_URL });
    const mid = await prisma.clientProfile.findUniqueOrThrow({ where: { id: clientProfileId } });
    expect(mid.consentTreatmentAt?.getTime()).toBe(s1.signedAt.getTime());
    expect(mid.consentDataAt).toBeNull();

    const s2 = await signConsent({ clientProfileId, consentFormId: photo.id, signerName: "Test Signer", signatureData: TINY_PNG_DATA_URL });
    const after = await prisma.clientProfile.findUniqueOrThrow({ where: { id: clientProfileId } });
    expect(after.consentDataAt?.getTime()).toBe(s2.signedAt.getTime());

    const status = await consentStatusForClient(clientProfileId);
    const generalRow = status.find((r) => r.key === CONSENT_KEYS.GENERAL);
    expect(generalRow?.required).toBe(true);
    expect(generalRow?.upToDate).toBe(true);
  });
});
