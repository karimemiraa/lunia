import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Department, Brand } from "@prisma/client";

import { Hero } from "@/components/site/Hero";
import { Section } from "@/components/site/Section";
import { SectionHeading } from "@/components/site/SectionHeading";
import { JourneySteps } from "@/components/site/JourneySteps";
import { ServiceCard } from "@/components/site/ServiceCard";
import { BrandCard } from "@/components/site/BrandCard";
import { Testimonials } from "@/components/site/Testimonials";
import { CtaBand } from "@/components/site/CtaBand";
import { Faq } from "@/components/site/Faq";
import { JsonLd } from "@/components/seo/JsonLd";

import { getHomeHero, type PublicLocale } from "@/modules/cms/publicContent";
import { getMedia } from "@/modules/cms/media";
import { getSetting } from "@/modules/cms/settings";
import { getEnv } from "@/lib/env";
import { listDepartments } from "@/modules/catalog/departments";
import { listBrands } from "@/modules/catalog/brands";
import { localized } from "@/modules/catalog/localize";
import { buildMetadata } from "@/modules/seo/metadata";
import { localBusinessJsonLd, faqPageJsonLd } from "@/modules/seo/jsonld";

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

interface StepMessage {
  title: string;
  body?: string;
}

interface TestimonialMessage {
  quote: string;
  author?: string;
}

interface FaqMessage {
  q: string;
  a: string;
}

function isPublicLocale(locale: string): locale is PublicLocale {
  return locale === "ar" || locale === "en";
}

// Resolves a Department/Brand's optional heroMediaId/logoMediaId into the
// {key, kind} shape the site's card/media components expect, or null if
// unset or the referenced asset is gone.
async function resolveMedia(mediaId: string | null): Promise<{ key: string; kind: "IMAGE" | "VIDEO" } | null> {
  if (!mediaId) return null;
  const media = await getMedia(mediaId).catch(() => null);
  return media ? { key: media.storageKey, kind: media.kind } : null;
}

// Falls back to the localized messages copy when the SiteSetting("seo")
// defaults haven't been configured yet, so the home page never ships blank
// metadata on a fresh environment.
export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [seo, tMetaEn, tMetaAr] = await Promise.all([
    getSetting("seo").catch(() => null),
    getTranslations({ locale: "en", namespace: "home.meta" }),
    getTranslations({ locale: "ar", namespace: "home.meta" }),
  ]);

  return buildMetadata({
    locale,
    path: "/",
    titleEn: seo?.defaultTitleEn ?? tMetaEn("title"),
    titleAr: seo?.defaultTitleAr ?? tMetaAr("title"),
    descEn: seo?.defaultDescEn ?? tMetaEn("description"),
    descAr: seo?.defaultDescAr ?? tMetaAr("description"),
  });
}

export default async function Home({ params }: HomePageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [hero, departments, brands, business, social, seo, tCommon, tHero, tPositioning, tServices, tJourney, tBrands, tTestimonials, tCta, tFaq, tMeta] =
    await Promise.all([
      getHomeHero(locale),
      listDepartments({ publishedOnly: true }),
      listBrands({ publishedOnly: true }),
      getSetting("business").catch(() => null),
      getSetting("social").catch(() => null),
      getSetting("seo").catch(() => null),
      getTranslations({ locale, namespace: "common" }),
      getTranslations({ locale, namespace: "home.hero" }),
      getTranslations({ locale, namespace: "home.positioning" }),
      getTranslations({ locale, namespace: "home.services" }),
      getTranslations({ locale, namespace: "home.journey" }),
      getTranslations({ locale, namespace: "home.brands" }),
      getTranslations({ locale, namespace: "home.testimonials" }),
      getTranslations({ locale, namespace: "home.cta" }),
      getTranslations({ locale, namespace: "home.faq" }),
      getTranslations({ locale, namespace: "home.meta" }),
    ]);

  const contactHref = `/${locale}/contact`;

  const departmentMedia = await Promise.all(
    departments.map((department: Department) => resolveMedia(department.heroMediaId)),
  );
  const brandMedia = await Promise.all(brands.map((brand: Brand) => resolveMedia(brand.logoMediaId)));

  const journeySteps = (tJourney.raw("steps") as StepMessage[]).map((step) => ({
    title: step.title,
    body: step.body,
  }));

  const testimonialItems = (tTestimonials.raw("items") as TestimonialMessage[]).map((item) => ({
    quote: item.quote,
    author: item.author,
  }));

  const faqItems = tFaq.raw("items") as FaqMessage[];

  let appUrl = "http://localhost:3000";
  try {
    appUrl = getEnv().APP_URL;
  } catch {
    // fall back to the localhost default above (e.g. in test environments)
  }
  const homeUrl = `${appUrl}/${locale}`;

  // Sourced from the SEO/meta description (SiteSetting("seo") defaults, or
  // the localized home.meta copy as a fallback) rather than the hero intro,
  // so the LocalBusiness description isn't empty when no hero copy is set.
  const seoDescription =
    (locale === "ar" ? seo?.defaultDescAr : seo?.defaultDescEn) ?? tMeta("description");

  const localBusiness =
    business && social
      ? localBusinessJsonLd(business, social, {
          locale,
          url: homeUrl,
          description: seoDescription,
        })
      : null;

  const faqEntity = faqItems.length > 0 ? faqPageJsonLd(faqItems.map(({ q, a }) => ({ q, a }))) : null;

  return (
    <main className="flex flex-col">
      {(localBusiness || faqEntity) && (
        <JsonLd data={[...(localBusiness ? [localBusiness] : []), ...(faqEntity ? [faqEntity] : [])]} />
      )}

      <Hero
        eyebrow={tHero("eyebrow")}
        headline={hero.headline}
        subhead={hero.intro || undefined}
        ctaLabel={hero.cta}
        ctaHref={contactHref}
        media={hero.heroMedia}
      />

      <Section tone="plain">
        <SectionHeading
          eyebrow={tPositioning("eyebrow")}
          heading={tPositioning("heading")}
          intro={tPositioning("body")}
          align="center"
          className="mx-auto"
        />
      </Section>

      <Section tone="tinted">
        <div className="flex flex-col gap-14">
          <SectionHeading eyebrow={tServices("eyebrow")} heading={tServices("heading")} intro={tServices("intro")} />
          <div className="grid gap-x-10 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((department: Department, index: number) => (
              <ServiceCard
                key={department.id}
                name={localized(locale, department.nameEn, department.nameAr)}
                summary={localized(locale, department.taglineEn, department.taglineAr)}
                href={`/${locale}/services/${department.slug}`}
                media={departmentMedia[index]}
              />
            ))}
          </div>
        </div>
      </Section>

      <Section tone="plain">
        <JourneySteps eyebrow={tJourney("eyebrow")} heading={tJourney("heading")} steps={journeySteps} />
      </Section>

      <Section tone="tinted">
        <div className="flex flex-col gap-14">
          <SectionHeading eyebrow={tBrands("eyebrow")} heading={tBrands("heading")} intro={tBrands("intro")} />
          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
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
        </div>
      </Section>

      <Section tone="plain">
        <Testimonials
          eyebrow={tTestimonials("eyebrow")}
          heading={tTestimonials("heading")}
          items={testimonialItems}
        />
      </Section>

      {faqItems.length > 0 && (
        <Section tone="tinted">
          <div className="flex flex-col gap-10">
            <SectionHeading eyebrow={tFaq("eyebrow")} heading={tFaq("heading")} align="center" className="mx-auto" />
            <Faq items={faqItems} />
          </div>
        </Section>
      )}

      <Section tone="plain">
        <CtaBand
          eyebrow={tCta("eyebrow")}
          headline={tCta("headline")}
          ctaLabel={tCommon("bookNow")}
          ctaHref={contactHref}
        />
      </Section>
    </main>
  );
}
