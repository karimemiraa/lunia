import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/site/Section";
import { ResultsGallery } from "@/components/site/ResultsGallery";
import { CtaBand } from "@/components/site/CtaBand";
import { LocalNav } from "@/components/site/apple/LocalNav";
import { PageHero } from "@/components/site/apple/PageHero";
import { Chapter } from "@/components/site/apple/Chapter";
import { Statement } from "@/components/site/apple/Statement";
import { FeatureTiles } from "@/components/site/apple/FeatureTiles";
import type { IconName } from "@/components/site/apple/Icon";
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

  const measureIcons: IconName[] = ["camera", "clock", "lock"];
  const measureTiles = (tResults.raw("measure.tiles") as { title: string; body: string }[]).map((tile, i) => ({
    icon: measureIcons[i % measureIcons.length],
    title: tile.title,
    body: tile.body,
  }));

  const breadcrumb = breadcrumbJsonLd([
    { name: tNav("home"), url: `${appUrl}/${locale}` },
    { name: tNav("results"), url: `${appUrl}/${locale}/results` },
  ]);

  return (
    <main className="flex flex-col">
      <JsonLd data={breadcrumb} />

      <LocalNav
        title={tNav("results")}
        links={[
          { href: "#gallery", label: tResults("localNav.gallery") },
          { href: "#measure", label: tResults("localNav.measure") },
        ]}
        cta={{ href: bookHref, label: tCommon("bookNow") }}
      />

      {/* The hero film shows the diagnostic process, never a "result": only
          consented customer photography is ever presented as an outcome. */}
      <PageHero
        eyebrow={tHero("eyebrow")}
        title={tHero("heading")}
        lead={tHero("intro")}
        cta={{ href: bookHref, label: tCommon("bookNow") }}
        secondary={{ href: "#gallery", label: tResults("localNav.gallery") }}
        media={{ type: "video", src: "/media/analyze.mp4", poster: "/media/analyze.jpg" }}
      />

      <Statement eyebrow={tResults("moment.eyebrow")} text={tResults("moment.headline")} />

      <Chapter id="gallery" tone="mist">
        <ResultsGallery
          items={items}
          categories={categories}
          allLabel={tResults("allLabel")}
          consentNote={tResults("consentNote")}
          emptyLabel={tResults("emptyLabel")}
        />
      </Chapter>

      <Chapter id="measure" eyebrow={tResults("measure.eyebrow")} heading={tResults("measure.heading")}>
        <div data-clip className="relative mb-5 aspect-[4/3] overflow-hidden rounded-[28px] bg-[var(--color-ice)] sm:mb-6 sm:aspect-[21/9]">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand media */}
          <img src="/media/clinic-lounge.webp" alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </div>
        <FeatureTiles tiles={measureTiles} columns={3} surface="mist" />
      </Chapter>

      <Section tone="plain">
        <CtaBand eyebrow={tCta("eyebrow")} headline={tCta("headline")} ctaLabel={tCommon("bookNow")} ctaHref={bookHref} />
      </Section>
    </main>
  );
}
