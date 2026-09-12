import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/site/Section";
import type { PublicLocale } from "@/modules/cms/publicContent";
import { getReviewByToken } from "@/modules/reviews/reviews";
import { ReviewForm } from "./ReviewForm";

interface ReviewTokenPageProps {
  params: Promise<{ locale: string; token: string }>;
}

function isPublicLocale(locale: string): locale is PublicLocale {
  return locale === "ar" || locale === "en";
}

// Never indexed: this is a one-time, per-recipient link, not public content.
export async function generateMetadata({ params }: ReviewTokenPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations({ locale, namespace: "review.meta" });

  return {
    title: t("title"),
    description: t("description"),
    robots: { index: false, follow: false },
  };
}

export default async function ReviewTokenPage({ params }: ReviewTokenPageProps) {
  const { locale: rawLocale, token } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations({ locale, namespace: "review" });

  const review = await getReviewByToken(token);

  return (
    <main className="flex flex-col">
      <Section tone="plain">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-8 text-start">
          <div className="flex flex-col gap-3">
            <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)]">
              {t("heading")}
            </h1>
            <p className="text-sm leading-relaxed text-[var(--color-ink)]/65">{t("intro")}</p>
          </div>

          {!review ? (
            <div className="lunia-card flex flex-col gap-3 p-8 text-center" data-testid="review-invalid">
              <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
                {t("invalidHeading")}
              </h2>
              <p className="text-sm leading-relaxed text-[var(--color-ink)]/65">{t("invalidBody")}</p>
            </div>
          ) : review.tokenUsedAt ? (
            <div className="lunia-card flex flex-col gap-3 p-8 text-center" data-testid="review-already-used">
              <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
                {t("alreadySubmittedHeading")}
              </h2>
              <p className="text-sm leading-relaxed text-[var(--color-ink)]/65">{t("alreadySubmittedBody")}</p>
            </div>
          ) : (
            <ReviewForm token={token} locale={locale} />
          )}
        </div>
      </Section>
    </main>
  );
}
