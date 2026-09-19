import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/site/Section";
import { buildMetadata } from "@/modules/seo/metadata";
import type { PublicLocale } from "@/modules/cms/publicContent";
import { GiftCardForm } from "./GiftCardForm";

interface GiftCardsPageProps {
  params: Promise<{ locale: string }>;
}

function isPublicLocale(locale: string): locale is PublicLocale {
  return locale === "ar" || locale === "en";
}

export async function generateMetadata({ params }: GiftCardsPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  const [tEn, tAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "giftCards.meta" }),
    getTranslations({ locale: "ar", namespace: "giftCards.meta" }),
  ]);
  return buildMetadata({
    locale,
    path: "/gift-cards",
    titleEn: tEn("title"),
    titleAr: tAr("title"),
    descEn: tEn("description"),
    descAr: tAr("description"),
  });
}

export default async function GiftCardsPage({ params }: GiftCardsPageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations({ locale, namespace: "giftCards" });

  return (
    <main className="flex flex-col">
      <Section tone="plain">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
          <div className="flex flex-col gap-3 text-start">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-teal-ink,#2f6d67)]">
              {t("hero.eyebrow")}
            </span>
            <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)] sm:text-4xl">
              {t("hero.heading")}
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-[var(--color-ink)]/65">{t("hero.intro")}</p>
          </div>
          <GiftCardForm locale={locale} />
        </div>
      </Section>
    </main>
  );
}
