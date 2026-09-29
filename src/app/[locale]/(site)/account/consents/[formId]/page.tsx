import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Section } from "@/components/site/Section";
import { ConsentSignForm } from "@/components/clinical/ConsentSignForm";
import { consentStatusForClient, getConsentForm } from "@/modules/clinical/consents";
import { signMyConsent } from "../../clinical-actions";
import { asAccountLocale, requireAccountProfile } from "../../clinicalAccess";

interface ConsentSignPageProps {
  params: Promise<{ locale: string; formId: string }>;
}

export const metadata = { robots: { index: false, follow: false } };

export default async function ConsentSignPage({ params }: ConsentSignPageProps) {
  const { locale: rawLocale, formId } = await params;
  const locale = asAccountLocale(rawLocale);
  const profile = await requireAccountProfile(locale);

  // Only forms offered to this client (see consentStatusForClient).
  const offered = (await consentStatusForClient(profile.id)).some((row) => row.formId === formId);
  const form = offered ? await getConsentForm(formId) : null;
  if (!form) notFound();

  const t = await getTranslations({ locale, namespace: "consents.sign" });
  const title = locale === "ar" ? form.titleAr : form.titleEn;
  const body = locale === "ar" ? form.bodyAr : form.bodyEn;

  return (
    <main className="flex flex-col">
      <Section tone="plain">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
          <Link href={`/${locale}/account`} className="text-sm text-[var(--color-ink)]/75 hover:text-[var(--color-ink)]">
            {t("back")}
          </Link>
          <div className="flex flex-col gap-2">
            <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)] sm:text-4xl">{title}</h1>
            <p className="text-sm text-[var(--color-ink)]/75">{t("version", { version: form.version })}</p>
          </div>
          <p className="text-sm text-[var(--color-ink)]/75">{t("readCarefully")}</p>
          <div className="lunia-card flex max-h-[28rem] flex-col gap-4 overflow-y-auto p-6 text-[0.95rem] leading-relaxed text-[var(--color-ink)]" tabIndex={0}>
            {body.split("\n\n").map((para, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {para}
              </p>
            ))}
          </div>
          <div className="lunia-card p-6">
            <ConsentSignForm
              defaultName={profile.fullName}
              submit={signMyConsent.bind(null, form.id, locale)}
              signedHrefPrefix={`/${locale}/account/consents/signed/`}
              backHref={`/${locale}/account`}
            />
          </div>
        </div>
      </Section>
    </main>
  );
}
