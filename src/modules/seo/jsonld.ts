import type { BusinessSettings, HoursSettings, SocialSettings } from "@/modules/cms/settings";

export type JsonLdLocale = "ar" | "en";

// Plain JSON-LD object. Callers render it via <JsonLd data={...} /> (a
// <script type="application/ld+json"> component) — these helpers never
// touch the DOM or fetch data themselves, so they stay pure and unit-testable.
export type JsonLd = Record<string, unknown>;

const SCHEMA_CONTEXT = "https://schema.org";

const DAY_NAMES: Record<keyof HoursSettings, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

function openingHoursSpecification(hours: HoursSettings): JsonLd[] {
  return (Object.keys(DAY_NAMES) as Array<keyof HoursSettings>)
    .map((day) => ({ day, ...hours[day] }))
    .filter((entry) => !entry.closed)
    .map((entry) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `${SCHEMA_CONTEXT}/${DAY_NAMES[entry.day]}`,
      opens: entry.open,
      closes: entry.close,
    }));
}

export interface LocalBusinessOpts {
  locale: JsonLdLocale;
  url: string;
  description?: string;
  priceRange?: string;
  hours?: HoursSettings;
}

// Riyadh HealthAndBeautyBusiness structured data for the site-wide LocalBusiness
// entity (rendered on the home/about/contact pages).
export function localBusinessJsonLd(
  business: BusinessSettings,
  social: SocialSettings,
  opts: LocalBusinessOpts,
): JsonLd {
  const { locale, url, description, priceRange, hours } = opts;
  const name = locale === "ar" ? business.nameAr : business.nameEn;
  const streetAddress = locale === "ar" ? business.addressAr : business.addressEn;

  const sameAs = [social.instagram, social.tiktok, social.snapchat, social.x].filter(
    (value): value is string => Boolean(value),
  );

  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "HealthAndBeautyBusiness",
    name,
    ...(description ? { description } : {}),
    address: {
      "@type": "PostalAddress",
      streetAddress,
      addressLocality: "Riyadh",
      addressCountry: "SA",
    },
    telephone: business.phone,
    email: business.email,
    url,
    ...(sameAs.length > 0 ? { sameAs } : {}),
    areaServed: "Riyadh",
    ...(priceRange ? { priceRange } : {}),
    ...(hours ? { openingHoursSpecification: openingHoursSpecification(hours) } : {}),
  };
}

export interface ServiceJsonLdInput {
  name: string;
  description: string;
  url: string;
  /** Provider name (e.g. the business name), or a fuller provider object. */
  provider: string | { name: string; url?: string };
}

export function serviceJsonLd(input: ServiceJsonLdInput): JsonLd {
  const provider =
    typeof input.provider === "string"
      ? { "@type": "Organization", name: input.provider }
      : { "@type": "Organization", ...input.provider };

  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "Service",
    name: input.name,
    description: input.description,
    url: input.url,
    provider,
  };
}

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function breadcrumbJsonLd(items: BreadcrumbItem[]): JsonLd {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export interface ArticleJsonLdInput {
  headline: string;
  description: string;
  url: string;
  datePublished: string;
  author: string;
  image?: string;
}

export function articleJsonLd(input: ArticleJsonLdInput): JsonLd {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "Article",
    headline: input.headline,
    description: input.description,
    url: input.url,
    datePublished: input.datePublished,
    author: { "@type": "Organization", name: input.author },
    ...(input.image ? { image: input.image } : {}),
  };
}

export interface QaPair {
  q: string;
  a: string;
}

export function faqPageJsonLd(qa: QaPair[]): JsonLd {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "FAQPage",
    mainEntity: qa.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: {
        "@type": "Answer",
        text: a,
      },
    })),
  };
}

// The schema.org type + identity of the thing a rating/review is about
// (the site-wide LocalBusiness on Home, or a Service on a department page).
export interface ReviewedItem {
  type: string;
  name: string;
  url?: string;
}

function itemReviewedEntity(item: ReviewedItem): JsonLd {
  return {
    "@type": item.type,
    name: item.name,
    ...(item.url ? { url: item.url } : {}),
  };
}

export interface AggregateRatingJsonLdInput {
  itemReviewed: ReviewedItem;
  /** Average rating, 1..5. */
  ratingValue: number;
  /** Number of ratings the average is computed over. Callers MUST only call this when count > 0 -- an AggregateRating with zero reviews should never be emitted. */
  reviewCount: number;
}

// Standalone AggregateRating entity (resolves the Stage-3 AggregateRating
// deferral) -- valid per Google's "review snippet" structured-data guidance
// as either a property nested inside the rated entity, or a standalone
// AggregateRating/Review that names what it's about via `itemReviewed`. The
// standalone form is used here so Home (itemReviewed = the LocalBusiness)
// and each Service (itemReviewed = that Service) can share one builder
// without threading an aggregateRating field through localBusinessJsonLd/
// serviceJsonLd's existing signatures.
export function aggregateRatingJsonLd(input: AggregateRatingJsonLdInput): JsonLd {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "AggregateRating",
    itemReviewed: itemReviewedEntity(input.itemReviewed),
    ratingValue: Math.round(input.ratingValue * 10) / 10,
    reviewCount: input.reviewCount,
    bestRating: 5,
    worstRating: 1,
  };
}

export interface ReviewJsonLdInput {
  itemReviewed: ReviewedItem;
  author: string;
  /** 1..5. */
  ratingValue: number;
  reviewBody?: string;
  /** ISO 8601 date/datetime the review was approved/published. */
  datePublished: string;
}

export function reviewJsonLd(input: ReviewJsonLdInput): JsonLd {
  return {
    "@context": SCHEMA_CONTEXT,
    "@type": "Review",
    itemReviewed: itemReviewedEntity(input.itemReviewed),
    author: { "@type": "Person", name: input.author },
    reviewRating: {
      "@type": "Rating",
      ratingValue: input.ratingValue,
      bestRating: 5,
      worstRating: 1,
    },
    ...(input.reviewBody ? { reviewBody: input.reviewBody } : {}),
    datePublished: input.datePublished,
  };
}
