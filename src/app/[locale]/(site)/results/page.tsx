import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Hero } from "@/components/site/Hero";
import { Section } from "@/components/site/Section";
import { ResultsGallery } from "@/components/site/ResultsGallery";
import { CtaBand } from "@/components/site/CtaBand";
import { CinematicImage } from "@/components/site/CinematicImage";
import { JsonLd } from "@/components/seo/JsonLd";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/modules/seo/metadata";
import { breadcrumbJsonLd } from "@/modules/seo/jsonld";

interface ResultsPageProps {
  params: Promise<{ locale: string }>;
}

function isPublicLocale(locale: string): locale is PublicLocale {
  return locale === "ar" || locale === "en";
}

function resolveAppUrl(): string {
  try {
    return getEnv().APP_URL;
  } catch {
    return "http://localhost:3000";
  }
}

export async function generateMetadata({ params }: ResultsPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [tMetaEn, tMetaAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "resultsIndex.meta" }),
    getTranslations({ locale: "ar", namespace: "resultsIndex.meta" }),
  ]);

  return buildMetadata({
    locale,
    path: "/results",
    titleEn: tMetaEn("title"),
    titleAr: tMetaAr("title"),
    descEn: tMetaEn("description"),
    descAr: tMetaAr("description"),
  });
}

export default async function ResultsPage({ params }: ResultsPageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [tCommon, tNav, tHero, tResults, tCta] = await Promise.all([
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "resultsIndex.hero" }),
    getTranslations({ locale, namespace: "resultsIndex" }),
    getTranslations({ locale, namespace: "resultsIndex.cta" }),
  ]);

  const bookHref = `/${locale}/book`;
  const appUrl = resolveAppUrl();

  const categories = tResults.raw("categories") as string[];
  const beforeAfterLabel = tResults("beforeAfterLabel");

  // No real client photography yet — each category gets a couple of
  // consent-flagged placeholder slots so the grid reads as intentional
  // (not broken) while real before/after media is pending upload.
  const items = categories.flatMap((category) => [
    { category, caption: `${category} · ${beforeAfterLabel}` },
    { category, caption: `${category} · ${beforeAfterLabel}` },
  ]);

  const breadcrumb = breadcrumbJsonLd([
    { name: tNav("home"), url: `${appUrl}/${locale}` },
    { name: tNav("results"), url: `${appUrl}/${locale}/results` },
  ]);

  return (
    <main className="flex flex-col">
      <JsonLd data={breadcrumb} />

      <Hero
        eyebrow={tHero("eyebrow")}
        headline={tHero("heading")}
        subhead={tHero("intro")}
        ctaLabel={tCommon("bookNow")}
        ctaHref={bookHref}
      />

      <Section tone="plain">
        <ResultsGallery
          items={items}
          categories={categories}
          allLabel={tResults("allLabel")}
          consentNote={tResults("consentNote")}
          emptyLabel={tResults("emptyLabel")}
        />
      </Section>

      <CinematicImage src="/brand/experience-brush.jpg" alt={tCommon("brandName")} />

      <Section tone="tinted">
        <CtaBand eyebrow={tCta("eyebrow")} headline={tCta("headline")} ctaLabel={tCommon("bookNow")} ctaHref={bookHref} />
      </Section>
    </main>
  );
}
