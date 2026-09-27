import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Section } from "@/components/site/Section";
import { HealthForm } from "@/components/clinical/HealthForm";
import { getLatestIntake, parseIntakeAnswers } from "@/modules/clinical/intake";
import { buildMetadata } from "@/modules/seo/metadata";
import { saveMyHealthProfile } from "../clinical-actions";
import { asAccountLocale, requireAccountProfile } from "../clinicalAccess";

interface HealthPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: HealthPageProps): Promise<Metadata> {
  const locale = asAccountLocale((await params).locale);
  const [en, ar] = await Promise.all([
    getTranslations({ locale: "en", namespace: "health.meta" }),
    getTranslations({ locale: "ar", namespace: "health.meta" }),
  ]);
  return {
    ...buildMetadata({
      locale,
      path: "/account/health",
      titleEn: en("title"),
      titleAr: ar("title"),
      descEn: en("description"),
      descAr: ar("description"),
    }),
    robots: { index: false, follow: false },
  };
}

export default async function HealthPage({ params }: HealthPageProps) {
  const locale = asAccountLocale((await params).locale);
  const profile = await requireAccountProfile(locale);
  const [latest, t] = await Promise.all([getLatestIntake(profile.id), getTranslations({ locale, namespace: "health" })]);

  return (
    <main className="flex flex-col">
      <Section tone="plain">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
          <Link href={`/${locale}/account`} className="text-sm text-[var(--color-ink)]/60 hover:text-[var(--color-ink)]">
            {t("back")}
          </Link>
          <div className="flex flex-col gap-3">
            <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)] sm:text-4xl">{t("heading")}</h1>
            <p className="text-[var(--color-ink)]/70">{t("intro")}</p>
            <p className="text-sm text-[var(--color-ink)]/55">{t("privacy")}</p>
          </div>
          <div className="lunia-card p-6 sm:p-8">
            <HealthForm initial={latest?.answers ?? parseIntakeAnswers({})} onSubmit={saveMyHealthProfile.bind(null, locale)} />
          </div>
        </div>
      </Section>
    </main>
  );
}
