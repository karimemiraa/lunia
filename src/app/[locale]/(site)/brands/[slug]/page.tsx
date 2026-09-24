import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import type { Brand } from "@prisma/client";
import { Section } from "@/components/site/Section";
import { CtaBand } from "@/components/site/CtaBand";
import { LocalNav } from "@/components/site/apple/LocalNav";
import { Chapter } from "@/components/site/apple/Chapter";
import { Gallery } from "@/components/site/apple/Gallery";
import { BrandTile } from "@/components/site/apple/BrandTile";
import { Statement } from "@/components/site/apple/Statement";
import { Chevron } from "@/components/site/home/AppleHero";
import { JsonLd } from "@/components/seo/JsonLd";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getMedia } from "@/modules/cms/media";
import { getEnv } from "@/lib/env";
import { getBrandBySlug, listBrands } from "@/modules/catalog/brands";
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

  const [tCommon, tNav, tBrand, tIndex, tUi, allBrands] = await Promise.all([
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "brandDetail" }),
    getTranslations({ locale, namespace: "brandsIndex" }),
    getTranslations({ locale, namespace: "ui" }),
    listBrands({ publishedOnly: true }),
  ]);

  const bookHref = `/${locale}/book`;
  const appUrl = resolveAppUrl();
  const brandUrl = `${appUrl}/${locale}/brands/${brand.slug}`;

  const logoMedia = await resolveMedia(brand.logoMediaId);
  const others = allBrands.filter((b: Brand) => b.id !== brand.id);
  const otherLogos = await Promise.all(others.map((b: Brand) => resolveMedia(b.logoMediaId)));

  const breadcrumb = breadcrumbJsonLd([
    { name: tNav("home"), url: `${appUrl}/${locale}` },
    { name: tNav("brands"), url: `${appUrl}/${locale}/brands` },
    { name: brand.name, url: brandUrl },
  ]);

  const whyChosen = localized(locale, brand.whyChosenEn, brand.whyChosenAr);

  return (
    <main className="flex flex-col">
      <JsonLd data={breadcrumb} />

      <LocalNav
        title={brand.name}
        titleHref={`/${locale}/brands`}
        links={[
          { href: "#overview", label: tBrand("localNav.overview") },
          ...(whyChosen ? [{ href: "#why", label: tBrand("localNav.why") }] : []),
        ]}
        cta={{ href: bookHref, label: tUi("book") }}
      />

      <section id="overview" className="scroll-mt-32 bg-[var(--color-page)] pb-[clamp(4rem,10svh,7rem)] pt-[clamp(4rem,10svh,7rem)]">
        <div className="mx-auto flex max-w-5xl flex-col items-center px-6 text-center">
          <span className="lx-eyebrow lunia-animate-fade-up">
            <span aria-hidden="true" className="lunia-glow-mark" />
            {tBrand("partnerLabel")}
          </span>
          <div className="lunia-pattern-mosaic lunia-animate-scale-in mt-8 flex aspect-[16/8] w-full max-w-3xl items-center justify-center overflow-hidden rounded-[32px] bg-white shadow-[0_40px_80px_-50px_rgba(34,63,58,0.45)]">
            {logoMedia ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded brand logo, arbitrary domain
              <img src={`/api/media/${logoMedia.key}`} alt={brand.name} className="max-h-28 w-auto max-w-[60%] object-contain sm:max-h-36" />
            ) : (
              <span className="lx-display lx-h2 text-[var(--color-ink)]">{brand.name}</span>
            )}
          </div>
          <h1 className="lx-display lx-h1 lunia-animate-fade-up lunia-delay-1 mt-12 text-[var(--color-ink)]">{brand.name}</h1>
          <p className="lx-lead lunia-animate-fade-up lunia-delay-2 mt-6 max-w-2xl">{localized(locale, brand.descEn, brand.descAr)}</p>
          <div className="lunia-animate-fade-up lunia-delay-3 mt-8 flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
            <a href={bookHref} className="lx-pill">
              {tCommon("bookNow")}
            </a>
            {brand.url && (
              <a href={brand.url} target="_blank" rel="noreferrer" className="lx-link">
                {tBrand("visitWebsite")}
                <Chevron />
              </a>
            )}
          </div>
        </div>
      </section>

      {whyChosen && <Statement id="why" eyebrow={tBrand("whyChosenLabel")} text={whyChosen} note={tBrand("treatmentsNote")} />}

      {others.length > 0 && (
        <Chapter tone="mist" heading={tBrand("othersHeading")} align="start" bleed>
          <Gallery label={tBrand("othersHeading")} prevLabel={tUi("prev")} nextLabel={tUi("next")}>
            {others.map((b: Brand, i: number) => (
              <BrandTile
                key={b.id}
                name={b.name}
                blurb={localized(locale, b.descEn, b.descAr)}
                href={`/${locale}/brands/${b.slug}`}
                logoKey={otherLogos[i]?.key ?? null}
                linkLabel={tIndex("learnMore")}
                className="w-[80vw] shrink-0 sm:w-[20rem] lg:w-[22rem]"
              />
            ))}
          </Gallery>
        </Chapter>
      )}

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
