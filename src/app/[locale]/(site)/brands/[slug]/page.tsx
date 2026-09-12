import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/site/Section";
import { CtaBand } from "@/components/site/CtaBand";
import { MediaFrame } from "@/components/site/MediaFrame";
import { JsonLd } from "@/components/seo/JsonLd";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getMedia } from "@/modules/cms/media";
import { getEnv } from "@/lib/env";
import { getBrandBySlug } from "@/modules/catalog/brands";
import { localized } from "@/modules/catalog/localize";
import { buildMetadata } from "@/modules/seo/metadata";
import { breadcrumbJsonLd } from "@/modules/seo/jsonld";

interface BrandPageProps {
  params: Promise<{ locale: string; slug: string }>;
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

// Pre-renders every published brand for both locales at build time.
export async function generateMetadata({ params }: BrandPageProps): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const brand = await getBrandBySlug(slug);
  if (!brand || !brand.isPublished) {
    return { title: "Not found" };
  }

  const [tBrandEn, tBrandAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "common" }),
    getTranslations({ locale: "ar", namespace: "common" }),
  ]);

  return buildMetadata({
    locale,
    path: `/brands/${brand.slug}`,
    titleEn: `${brand.name} | ${tBrandEn("brandName")}`,
    titleAr: `${brand.name} | ${tBrandAr("brandName")}`,
    descEn: brand.descEn,
    descAr: brand.descAr,
  });
}

export default async function BrandPage({ params }: BrandPageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const brand = await getBrandBySlug(slug);
  if (!brand || !brand.isPublished) {
    notFound();
  }

  const [tCommon, tNav, tBrand] = await Promise.all([
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "brandDetail" }),
  ]);

  const bookHref = `/${locale}/book`;
  const appUrl = resolveAppUrl();
  const brandUrl = `${appUrl}/${locale}/brands/${brand.slug}`;

  const logoMedia = await resolveMedia(brand.logoMediaId);

  const breadcrumb = breadcrumbJsonLd([
    { name: tNav("home"), url: `${appUrl}/${locale}` },
    { name: tNav("brands"), url: `${appUrl}/${locale}/brands` },
    { name: brand.name, url: brandUrl },
  ]);

  return (
    <main className="flex flex-col">
      <JsonLd data={breadcrumb} />

      <Section tone="plain">
        <div className="grid gap-10 sm:grid-cols-[1fr_1.1fr] sm:items-center sm:gap-16">
          <MediaFrame
            mediaKey={logoMedia?.key}
            kind={logoMedia?.kind}
            alt={brand.name}
            aspectClassName="aspect-square"
            className="mx-auto w-full max-w-xs sm:mx-0"
          />
          <div className="flex flex-col gap-6 text-start">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-canopy)]">
              {tNav("brands")}
            </span>
            <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.1] tracking-tight text-[var(--color-ink)] sm:text-5xl">
              {brand.name}
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-[var(--color-ink)]/70 sm:text-lg">
              {localized(locale, brand.descEn, brand.descAr)}
            </p>
            {brand.url && (
              <a
                href={brand.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-2 text-sm font-medium text-[var(--color-ink)] underline decoration-[var(--color-gold)] decoration-2 underline-offset-4"
              >
                {tBrand("visitWebsite")}
              </a>
            )}
          </div>
        </div>
      </Section>

      <Section tone="tinted">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 text-start">
          <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)] sm:text-3xl">
            {tBrand("whyChosenLabel")}
          </h2>
          <p className="text-base leading-relaxed text-[var(--color-ink)]/75 sm:text-lg">
            {localized(locale, brand.whyChosenEn, brand.whyChosenAr)}
          </p>
          <p className="text-sm leading-relaxed text-[var(--color-ink)]/55">{tBrand("treatmentsNote")}</p>
        </div>
      </Section>

      <Section tone="plain">
        <CtaBand
          eyebrow={tBrand("cta.eyebrow")}
          headline={tBrand("cta.headline")}
          ctaLabel={tCommon("bookNow")}
          ctaHref={bookHref}
        />
      </Section>
    </main>
  );
}
