import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { prisma } from "@/lib/db";
import { getSignature } from "@/modules/clinical/consents";
import { PrintButton } from "@/components/clinical/PrintButton";
import { SignedConsentDocument } from "@/components/clinical/SignedConsentDocument";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

interface Props {
  params: Promise<{ id: string; signatureId: string }>;
}

// Printable signed consent for the patient file (no admin chrome so it prints
// as a clean document). Labels follow the language the client signed in.
export default async function AdminSignedConsentPage({ params }: Props) {
  const { id, signatureId } = await params;
  await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  const signature = await getSignature(signatureId);
  if (!signature || signature.clientProfileId !== id) notFound();

  const witness = signature.witnessUserId
    ? await prisma.user.findUnique({ where: { id: signature.witnessUserId }, select: { email: true, staffProfile: { select: { fullName: true } } } })
    : null;
  const labels = (signature.locale === "ar" ? ar : en).consents.signed;
  const signedAtLabel = new Intl.DateTimeFormat(signature.locale === "ar" ? "ar-SA" : "en-US", {
    timeZone: "Asia/Riyadh",
    dateStyle: "long",
    timeStyle: "short",
  }).format(signature.signedAt);

  return (
    <div className="min-h-screen bg-[var(--surface-2)] px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/admin/clients/${id}`} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
          Back to customer
        </Link>
        <PrintButton label="Print" className="lunia-btn lunia-btn-forest lunia-btn-sm min-h-11" />
      </div>
      <SignedConsentDocument
        snapshot={signature.bodySnapshot}
        locale={signature.locale}
        signerName={signature.signerName}
        signedAtLabel={signedAtLabel}
        version={signature.formVersion}
        signatureData={signature.signatureData}
        labels={{ signedBy: labels.signedBy, signedAt: labels.signedAt, version: labels.version }}
        footer={
          <p dir="ltr" className="border-t border-[var(--color-ink)]/10 pt-3 text-xs text-[var(--color-ink)]/55">
            Record {signature.id} · {signature.consentForm.key}
            {signature.ip ? ` · IP ${signature.ip}` : ""}
            {witness ? ` · Witnessed at the desk by ${witness.staffProfile?.fullName || witness.email}` : " · Signed online by the customer"}
            {signature.bookingId ? ` · Booking ${signature.bookingId}` : ""}
          </p>
        }
      />
    </div>
  );
}
