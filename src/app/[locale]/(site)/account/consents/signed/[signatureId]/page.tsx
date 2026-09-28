import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Section } from "@/components/site/Section";
import { PrintButton } from "@/components/clinical/PrintButton";
import { SignedConsentDocument } from "@/components/clinical/SignedConsentDocument";
import { getSignature } from "@/modules/clinical/consents";
import { asAccountLocale, requireAccountProfile } from "../../../clinicalAccess";

interface SignedConsentPageProps {
  params: Promise<{ locale: string; signatureId: string }>;
}

export const metadata = { robots: { index: false, follow: false } };

export default async function SignedConsentPage({ params }: SignedConsentPageProps) {
  const { locale: rawLocale, signatureId } = await params;
  const locale = asAccountLocale(rawLocale);
  const profile = await requireAccountProfile(locale);

  const signature = await getSignature(signatureId);
  // Same 404 for "not yours" and "doesn't exist".
  if (!signature || signature.clientProfileId !== profile.id) notFound();

  const t = await getTranslations({ locale, namespace: "consents.signed" });
  const signedAtLabel = new Intl.DateTimeFormat(signature.locale === "ar" ? "ar-SA" : "en-US", {
    timeZone: "Asia/Riyadh",
    dateStyle: "long",
    timeStyle: "short",
  }).format(signature.signedAt);

  return (
    <main className="flex flex-col">
      <Section tone="plain">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <Link href={`/${locale}/account`} className="text-sm text-[var(--color-ink)]/75 hover:text-[var(--color-ink)]">
              {t("back")}
            </Link>
            <PrintButton
              label={t("print")}
              className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-ink)]/20 px-6 text-sm font-medium text-[var(--color-ink)] hover:bg-[var(--color-ink)]/5"
            />
          </div>
          <SignedConsentDocument
            snapshot={signature.bodySnapshot}
            locale={signature.locale}
            signerName={signature.signerName}
            signedAtLabel={signedAtLabel}
            version={signature.formVersion}
            signatureData={signature.signatureData}
            labels={{ signedBy: t("signedBy"), signedAt: t("signedAt"), version: t("version") }}
          />
        </div>
      </Section>
    </main>
  );
}
