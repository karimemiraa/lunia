import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Brand } from "@prisma/client";

import { Section } from "@/components/site/Section";
import { CtaBand } from "@/components/site/CtaBand";
import { LocalNav } from "@/components/site/apple/LocalNav";
import { PageHero } from "@/components/site/apple/PageHero";
import { Chapter } from "@/components/site/apple/Chapter";
import { BrandTile } from "@/components/site/apple/BrandTile";
import { FeatureTiles, type FeatureTile } from "@/components/site/apple/FeatureTiles";
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

  const [brands, tCommon, tNav, tHero, tCta, tIndex, tUi] = await Promise.all([
    listBrands({ publishedOnly: true }),
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "brandsIndex.hero" }),
    getTranslations({ locale, namespace: "brandsIndex.cta" }),
    getTranslations({ locale, namespace: "brandsIndex" }),
    getTranslations({ locale, namespace: "ui" }),
  ]);

  const bookHref = `/${locale}/book`;
  const appUrl = resolveAppUrl();

  const brandMedia = await Promise.all(brands.map((brand: Brand) => resolveMedia(brand.logoMediaId)));

  const standardIcons = ["flask", "shield", "drop", "chart"] as const;
  const standards: FeatureTile[] = (tIndex.raw("standards.tiles") as { title: string; body: string }[]).map((t, i) => ({
    icon: standardIcons[i] ?? "sparkle",
    title: t.title,
    body: t.body,
  }));

  const breadcrumb = breadcrumbJsonLd([
    { name: tNav("home"), url: `${appUrl}/${locale}` },
    { name: tNav("brands"), url: `${appUrl}/${locale}/brands` },
  ]);

  return (
    <main className="flex flex-col">
      <JsonLd data={breadcrumb} />

      <LocalNav
        title={tNav("brands")}
        links={[
          { href: "#partners", label: tIndex("localNav.partners") },
          { href: "#standards", label: tIndex("localNav.standards") },
        ]}
        cta={{ href: bookHref, label: tUi("book") }}
      />

      <PageHero
        eyebrow={tHero("eyebrow")}
        title={tHero("heading")}
        lead={tHero("intro")}
        cta={{ href: bookHref, label: tCommon("bookNow") }}
        secondary={{ href: "#partners", label: tIndex("partners.heading") }}
        media={{ type: "image", src: "/media/ritual-shelf.webp" }}
      />

      <Chapter id="partners" tone="mist" eyebrow={tIndex("partners.eyebrow")} heading={tIndex("partners.heading")}>
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {brands.map((brand: Brand, index: number) => (
            <BrandTile
              key={brand.id}
              name={brand.name}
              blurb={localized(locale, brand.descEn, brand.descAr)}
              href={`/${locale}/brands/${brand.slug}`}
              logoKey={brandMedia[index]?.key ?? null}
              linkLabel={tIndex("learnMore")}
            />
          ))}
        </div>
      </Chapter>

      <Chapter id="standards" tone="page" eyebrow={tIndex("standards.eyebrow")} heading={tIndex("standards.heading")}>
        <FeatureTiles tiles={standards} columns={4} />
      </Chapter>

      <Section tone="plain">
        <CtaBand eyebrow={tCta("eyebrow")} headline={tCta("headline")} ctaLabel={tCommon("bookNow")} ctaHref={bookHref} />
      </Section>
    </main>
  );
}
