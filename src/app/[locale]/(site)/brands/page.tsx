import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Brand } from "@prisma/client";

import { Hero } from "@/components/site/Hero";
import { Section } from "@/components/site/Section";
import { BrandCard } from "@/components/site/BrandCard";
import { CtaBand } from "@/components/site/CtaBand";
import { JsonLd } from "@/components/seo/JsonLd";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getMedia } from "@/modules/cms/media";
import { getEnv } from "@/lib/env";
import { listBrands } from "@/modules/catalog/brands";
import { localized } from "@/modules/catalog/localize";
import { buildMetadata } from "@/modules/seo/metadata";
import { breadcrumbJsonLd } from "@/modules/seo/jsonld";

interface BrandsPageProps {
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

async function resolveMedia(mediaId: string | null): Promise<{ key: string; kind: "IMAGE" | "VIDEO" } | null> {
  if (!mediaId) return null;
  const media = await getMedia(mediaId).catch(() => null);
  return media ? { key: media.storageKey, kind: media.kind } : null;
}

export async function generateMetadata({ params }: BrandsPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [tMetaEn, tMetaAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "brandsIndex.meta" }),
    getTranslations({ locale: "ar", namespace: "brandsIndex.meta" }),
  ]);

  return buildMetadata({
    locale,
    path: "/brands",
    titleEn: tMetaEn("title"),
    titleAr: tMetaAr("title"),
    descEn: tMetaEn("description"),
    descAr: tMetaAr("description"),
  });
}

export default async function BrandsPage({ params }: BrandsPageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [brands, tCommon, tNav, tHero, tCta] = await Promise.all([
    listBrands({ publishedOnly: true }),
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "brandsIndex.hero" }),
    getTranslations({ locale, namespace: "brandsIndex.cta" }),
  ]);

  const bookHref = `/${locale}/book`;
  const appUrl = resolveAppUrl();

  const brandMedia = await Promise.all(brands.map((brand: Brand) => resolveMedia(brand.logoMediaId)));

  const breadcrumb = breadcrumbJsonLd([
    { name: tNav("home"), url: `${appUrl}/${locale}` },
    { name: tNav("brands"), url: `${appUrl}/${locale}/brands` },
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
        <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand: Brand, index: number) => (
            <BrandCard
              key={brand.id}
              name={brand.name}
              blurb={localized(locale, brand.descEn, brand.descAr)}
              href={`/${locale}/brands/${brand.slug}`}
              logo={brandMedia[index]}
            />
          ))}
        </div>
      </Section>

      <Section tone="tinted">
        <CtaBand eyebrow={tCta("eyebrow")} headline={tCta("headline")} ctaLabel={tCommon("bookNow")} ctaHref={bookHref} />
      </Section>
    </main>
  );
}
