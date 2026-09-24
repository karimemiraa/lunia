import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Department, Brand } from "@prisma/client";

import { AppleHero } from "@/components/site/home/AppleHero";
import { Manifesto } from "@/components/site/home/Manifesto";
import { ValuesBento } from "@/components/site/home/ValuesBento";
import { DepartmentTiles } from "@/components/site/home/DepartmentTiles";
import { JourneySticky } from "@/components/site/home/JourneySticky";
import { HeroRatingCard } from "@/components/site/HeroRatingCard";
import { CinematicImage } from "@/components/site/CinematicImage";
import { Section } from "@/components/site/Section";
import { SectionHeading } from "@/components/site/SectionHeading";
import { BrandLogos } from "@/components/site/BrandLogos";
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
import { localBusinessJsonLd, faqPageJsonLd, aggregateRatingJsonLd, reviewJsonLd } from "@/modules/seo/jsonld";
import { listApprovedReviews, getAggregate } from "@/modules/reviews/reviews";

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

  const [hero, departments, brands, business, social, seo, tCommon, tHero, tManifesto, tValues, tSanctuary, tServices, tJourney, tBrands, tTestimonials, tCta, tFaq, tMeta] =
    await Promise.all([
      getHomeHero(locale),
      listDepartments({ publishedOnly: true }),
      listBrands({ publishedOnly: true }),
      getSetting("business").catch(() => null),
      getSetting("social").catch(() => null),
      getSetting("seo").catch(() => null),
      getTranslations({ locale, namespace: "common" }),
      getTranslations({ locale, namespace: "home.hero" }),
      getTranslations({ locale, namespace: "home.manifesto" }),
      getTranslations({ locale, namespace: "home.values" }),
      getTranslations({ locale, namespace: "home.sanctuary" }),
      getTranslations({ locale, namespace: "home.services" }),
      getTranslations({ locale, namespace: "home.journey" }),
      getTranslations({ locale, namespace: "home.brands" }),
      getTranslations({ locale, namespace: "home.testimonials" }),
      getTranslations({ locale, namespace: "home.cta" }),
      getTranslations({ locale, namespace: "home.faq" }),
      getTranslations({ locale, namespace: "home.meta" }),
    ]);

  const bookHref = `/${locale}/book`;

  // Approved + public-consent reviews feed Testimonials (falling back to the
  // static localized copy when there are none yet) and the AggregateRating/
  // Review JSON-LD below -- ONLY emitted when count > 0, since an
  // AggregateRating with zero reviews should never be published.
  const [reviewsAggregate, approvedReviews] = await Promise.all([
    getAggregate({}),
    listApprovedReviews({ limit: 6 }),
  ]);

  const departmentMedia = await Promise.all(
    departments.map((department: Department) => resolveMedia(department.heroMediaId)),
  );
  const brandMedia = await Promise.all(brands.map((brand: Brand) => resolveMedia(brand.logoMediaId)));

  const journeySteps = (tJourney.raw("steps") as StepMessage[]).map((step) => ({
    title: step.title,
    body: step.body,
  }));

  // Real approved reviews take priority over the static localized copy; the
  // static copy is kept as a fallback so the section never looks empty on a
  // fresh environment with no reviews yet.
  const reviewTestimonials = approvedReviews
    .filter((review) => review.body || review.title)
    .map((review) => ({
      quote: (review.body ?? review.title) as string,
      author: review.authorDisplayName ?? undefined,
    }));
  const testimonialItems =
    reviewTestimonials.length > 0
      ? reviewTestimonials
      : (tTestimonials.raw("items") as TestimonialMessage[]).map((item) => ({
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

  // Resolves the Stage-3 AggregateRating deferral. Never emitted with zero
  // reviews (getAggregate/listApprovedReviews already only count
  // APPROVED + consentPublic rows, so an empty result here just means no
  // publishable reviews exist yet).
  const businessName = business ? localized(locale, business.nameEn, business.nameAr) : tCommon("brandName");
  const itemReviewed = { type: "HealthAndBeautyBusiness", name: businessName, url: homeUrl };
  const aggregateRatingEntity =
    reviewsAggregate.count > 0
      ? aggregateRatingJsonLd({ itemReviewed, ratingValue: reviewsAggregate.avg, reviewCount: reviewsAggregate.count })
      : null;
  // listApprovedReviews() already scopes to consentPublic=true, so every row
  // here is safe to name in a public Review entity.
  const reviewEntities = approvedReviews.map((review) =>
    reviewJsonLd({
      itemReviewed,
      author: review.authorDisplayName ?? tCommon("brandName"),
      ratingValue: review.rating,
      reviewBody: review.body ?? undefined,
      datePublished: (review.approvedAt ?? review.createdAt).toISOString(),
    }),
  );

  const jsonLdEntities = [
    ...(localBusiness ? [localBusiness] : []),
    ...(faqEntity ? [faqEntity] : []),
    ...(aggregateRatingEntity ? [aggregateRatingEntity] : []),
    ...reviewEntities,
  ];

  return (
    <main className="flex flex-col">
      {jsonLdEntities.length > 0 && <JsonLd data={jsonLdEntities} />}

      <AppleHero
        eyebrow={tHero("eyebrow")}
        headline={hero.headline}
        subhead={hero.intro || tHero("subhead")}
        ctaLabel={hero.cta}
        ctaHref={bookHref}
        secondaryLabel={tHero("secondary")}
        secondaryHref="#philosophy"
        caption={tHero("caption")}
        media={hero.heroMedia}
        trust={
          reviewsAggregate.count > 0 ? (
            <HeroRatingCard
              avg={reviewsAggregate.avg}
              count={reviewsAggregate.count}
              summary={tTestimonials("ratingSummary", { count: reviewsAggregate.count })}
            />
          ) : undefined
        }
      />

      <Manifesto id="philosophy" eyebrow={tManifesto("eyebrow")} text={tManifesto("text")} />

      <ValuesBento
        eyebrow={tValues("eyebrow")}
        heading={tValues("heading")}
        intro={tValues("intro")}
        purity={{ title: tValues("purity.title"), body: tValues("purity.body") }}
        mastery={{ title: tValues("mastery.title"), body: tValues("mastery.body") }}
        revelation={{ title: tValues("revelation.title"), body: tValues("revelation.body") }}
        stats={[
          { value: departments.length, label: tValues("stats.departments") },
          { value: journeySteps.length, label: tValues("stats.steps") },
          { value: brands.length, label: tValues("stats.brands") },
          { value: 100, suffix: "%", label: tValues("stats.diagnostic") },
        ]}
      />

      <DepartmentTiles
        eyebrow={tServices("eyebrow")}
        heading={tServices("heading")}
        intro={tServices("intro")}
        exploreLabel={tServices("explore")}
        departments={departments.map((department: Department, index: number) => ({
          id: department.id,
          href: `/${locale}/services/${department.slug}`,
          name: localized(locale, department.nameEn, department.nameAr),
          tagline: localized(locale, department.taglineEn, department.taglineAr),
          media: departmentMedia[index],
        }))}
      />

      <CinematicImage
        src="/media/sanctuary.webp"
        alt={tSanctuary("heading")}
        eyebrow={tSanctuary("eyebrow")}
        headline={tSanctuary("heading")}
        intro={tSanctuary("body")}
      />

      <JourneySticky
        eyebrow={tJourney("eyebrow")}
        heading={tJourney("heading")}
        stepLabel={tJourney("stepLabel")}
        steps={journeySteps}
      />

      <Section tone="tinted">
        <div className="lunia-pattern-mosaic flex flex-col gap-14">
          <SectionHeading eyebrow={tBrands("eyebrow")} heading={tBrands("heading")} intro={tBrands("intro")} align="center" className="mx-auto" />
          <BrandLogos
            brands={brands.map((brand: Brand, index: number) => ({
              name: brand.name,
              href: `/${locale}/brands/${brand.slug}`,
              logoKey: brandMedia[index]?.key ?? null,
            }))}
          />
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
          ctaHref={bookHref}
        />
      </Section>
    </main>
  );
}
