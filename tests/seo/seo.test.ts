import { describe, it, expect } from "vitest";
import { buildMetadata } from "@/modules/seo/metadata";
import {
  localBusinessJsonLd,
  serviceJsonLd,
  breadcrumbJsonLd,
  articleJsonLd,
  faqPageJsonLd,
  aggregateRatingJsonLd,
  reviewJsonLd,
} from "@/modules/seo/jsonld";

describe("buildMetadata", () => {
  const base = {
    path: "/about",
    titleEn: "About Lunia",
    titleAr: "عن لونيا",
    descEn: "Saudi Arabia's first Skin Quality Center.",
    descAr: "أول مركز لجودة البشرة في المملكة العربية السعودية.",
  };

  it("uses the English title/description for locale en", () => {
    const metadata = buildMetadata({ locale: "en", ...base });
    expect(metadata.title).toBe(base.titleEn);
    expect(metadata.description).toBe(base.descEn);
  });

  it("uses the Arabic title/description for locale ar", () => {
    const metadata = buildMetadata({ locale: "ar", ...base });
    expect(metadata.title).toBe(base.titleAr);
    expect(metadata.description).toBe(base.descAr);
  });

  it("sets metadataBase from the app URL", () => {
    const metadata = buildMetadata({ locale: "en", ...base });
    expect(metadata.metadataBase).toBeInstanceOf(URL);
  });

  it("builds a correct canonical for the given locale", () => {
    const en = buildMetadata({ locale: "en", ...base });
    expect(en.alternates?.canonical).toBe("/en/about");

    const ar = buildMetadata({ locale: "ar", ...base });
    expect(ar.alternates?.canonical).toBe("/ar/about");
  });

  it("includes hreflang alternates for ar-SA, en, and x-default", () => {
    const metadata = buildMetadata({ locale: "en", ...base });
    const languages = metadata.alternates?.languages as Record<string, string>;
    expect(languages["ar-SA"]).toBe("/ar/about");
    expect(languages["en"]).toBe("/en/about");
    expect(languages["x-default"]).toBe("/ar/about");
  });

  it("handles the root path without a double slash", () => {
    const metadata = buildMetadata({ ...base, path: "/", locale: "en" });
    expect(metadata.alternates?.canonical).toBe("/en");
    const languages = metadata.alternates?.languages as Record<string, string>;
    expect(languages["ar-SA"]).toBe("/ar");
  });

  it("builds Open Graph fields", () => {
    const metadata = buildMetadata({ locale: "en", ...base, ogImageUrl: "https://example.com/og.jpg" });
    const og = metadata.openGraph as {
      title?: string;
      description?: string;
      type?: string;
      url?: string | URL | null;
      images?: unknown;
    } | null;
    expect(og?.title).toBe(base.titleEn);
    expect(og?.description).toBe(base.descEn);
    expect(og?.type).toBe("website");
    expect(og?.url).toBe("/en/about");
    expect(og?.images).toBeDefined();
  });

  it("builds a Twitter summary_large_image card", () => {
    const metadata = buildMetadata({ locale: "ar", ...base });
    const twitter = metadata.twitter as { card?: string; title?: string } | null;
    expect(twitter?.card).toBe("summary_large_image");
    expect(twitter?.title).toBe(base.titleAr);
  });
});

describe("localBusinessJsonLd", () => {
  const business = {
    nameEn: "Lunia",
    nameAr: "لونيا",
    addressEn: "Riyadh, Saudi Arabia",
    addressAr: "الرياض، المملكة العربية السعودية",
    phone: "+966500000000",
    whatsapp: "+966500000000",
    email: "hello@lunia.sa",
  };
  const social = {
    instagram: "https://instagram.com/lunia",
    tiktok: "https://tiktok.com/@lunia",
  };

  it("returns a HealthAndBeautyBusiness with name, address, and sameAs", () => {
    const jsonLd = localBusinessJsonLd(business, social, {
      locale: "en",
      url: "https://lunia.sa/en",
    });
    expect(jsonLd["@type"]).toBe("HealthAndBeautyBusiness");
    expect(jsonLd.name).toBe("Lunia");
    expect(jsonLd.address).toMatchObject({
      "@type": "PostalAddress",
      addressLocality: "Riyadh",
      addressCountry: "SA",
    });
    expect(jsonLd.telephone).toBe(business.phone);
    expect(jsonLd.url).toBe("https://lunia.sa/en");
    expect(jsonLd.sameAs).toEqual(expect.arrayContaining([social.instagram, social.tiktok]));
    expect(jsonLd.areaServed).toBe("Riyadh");
  });

  it("localizes the name and address for Arabic", () => {
    const jsonLd = localBusinessJsonLd(business, social, {
      locale: "ar",
      url: "https://lunia.sa/ar",
    });
    expect(jsonLd.name).toBe("لونيا");
    expect(jsonLd.address).toMatchObject({ streetAddress: business.addressAr });
  });

  it("omits priceRange when not given, includes it when given", () => {
    const withoutPrice = localBusinessJsonLd(business, social, { locale: "en", url: "https://lunia.sa/en" });
    expect(withoutPrice.priceRange).toBeUndefined();

    const withPrice = localBusinessJsonLd(business, social, {
      locale: "en",
      url: "https://lunia.sa/en",
      priceRange: "$$$",
    });
    expect(withPrice.priceRange).toBe("$$$");
  });

  it("converts opening hours to openingHoursSpecification, skipping closed days", () => {
    const jsonLd = localBusinessJsonLd(business, social, {
      locale: "en",
      url: "https://lunia.sa/en",
      hours: {
        mon: { open: "09:00", close: "21:00", closed: false },
        tue: { open: "09:00", close: "21:00", closed: false },
        wed: { open: "09:00", close: "21:00", closed: false },
        thu: { open: "09:00", close: "21:00", closed: false },
        fri: { open: "00:00", close: "00:00", closed: true },
        sat: { open: "09:00", close: "21:00", closed: false },
        sun: { open: "09:00", close: "21:00", closed: false },
      },
    });
    const spec = jsonLd.openingHoursSpecification as Array<{ dayOfWeek: string }>;
    expect(spec).toHaveLength(6);
    expect(spec.some((s) => s.dayOfWeek.includes("Friday"))).toBe(false);
    expect(spec.some((s) => s.dayOfWeek.includes("Monday"))).toBe(true);
  });
});

describe("serviceJsonLd", () => {
  it("returns a Service with the given fields", () => {
    const jsonLd = serviceJsonLd({
      name: "HydraFacial",
      description: "A deep-cleansing facial.",
      url: "https://lunia.sa/en/services/hydrafacial",
      provider: "Lunia",
    });
    expect(jsonLd["@type"]).toBe("Service");
    expect(jsonLd.name).toBe("HydraFacial");
    expect(jsonLd.url).toBe("https://lunia.sa/en/services/hydrafacial");
    expect(jsonLd.provider).toMatchObject({ name: "Lunia" });
  });
});

describe("breadcrumbJsonLd", () => {
  it("builds a BreadcrumbList with incrementing positions", () => {
    const jsonLd = breadcrumbJsonLd([
      { name: "Home", url: "https://lunia.sa/en" },
      { name: "Services", url: "https://lunia.sa/en/services" },
      { name: "HydraFacial", url: "https://lunia.sa/en/services/hydrafacial" },
    ]);
    expect(jsonLd["@type"]).toBe("BreadcrumbList");
    const items = jsonLd.itemListElement as Array<{ position: number; name: string }>;
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items[0]).toMatchObject({ "@type": "ListItem", position: 1, name: "Home" });
  });
});

describe("articleJsonLd", () => {
  it("builds an Article with the given fields", () => {
    const jsonLd = articleJsonLd({
      headline: "Why Skin Quality Matters",
      description: "An explainer on skin quality vs. facials.",
      url: "https://lunia.sa/en/journal/skin-quality",
      datePublished: "2026-01-01",
      author: "Lunia",
    });
    expect(jsonLd["@type"]).toBe("Article");
    expect(jsonLd.headline).toBe("Why Skin Quality Matters");
    expect(jsonLd.datePublished).toBe("2026-01-01");
  });
});

describe("faqPageJsonLd", () => {
  it("maps qa pairs to mainEntity Question/Answer", () => {
    const jsonLd = faqPageJsonLd([
      { q: "Is this a facial?", a: "No, it targets skin quality at a deeper level." },
      { q: "Where are you located?", a: "Riyadh, Saudi Arabia." },
    ]);
    expect(jsonLd["@type"]).toBe("FAQPage");
    const entities = jsonLd.mainEntity as Array<{ "@type": string; name: string; acceptedAnswer: { "@type": string; text: string } }>;
    expect(entities).toHaveLength(2);
    expect(entities[0]).toMatchObject({
      "@type": "Question",
      name: "Is this a facial?",
      acceptedAnswer: { "@type": "Answer", text: "No, it targets skin quality at a deeper level." },
    });
  });
});

describe("aggregateRatingJsonLd", () => {
  it("builds a standalone AggregateRating naming what it's about via itemReviewed", () => {
    const jsonLd = aggregateRatingJsonLd({
      itemReviewed: { type: "HealthAndBeautyBusiness", name: "Lunia", url: "https://lunia.sa/en" },
      ratingValue: 4.66,
      reviewCount: 23,
    });
    expect(jsonLd["@type"]).toBe("AggregateRating");
    expect(jsonLd.itemReviewed).toMatchObject({ "@type": "HealthAndBeautyBusiness", name: "Lunia" });
    // Rounded to one decimal place.
    expect(jsonLd.ratingValue).toBe(4.7);
    expect(jsonLd.reviewCount).toBe(23);
    expect(jsonLd.bestRating).toBe(5);
    expect(jsonLd.worstRating).toBe(1);
  });
});

describe("reviewJsonLd", () => {
  it("builds a Review entity with a nested Person author and Rating", () => {
    const jsonLd = reviewJsonLd({
      itemReviewed: { type: "Service", name: "Diagnostic Skin Analysis" },
      author: "Sara A.",
      ratingValue: 5,
      reviewBody: "Loved every minute.",
      datePublished: "2026-02-01T00:00:00.000Z",
    });
    expect(jsonLd["@type"]).toBe("Review");
    expect(jsonLd.author).toMatchObject({ "@type": "Person", name: "Sara A." });
    expect(jsonLd.reviewRating).toMatchObject({ "@type": "Rating", ratingValue: 5, bestRating: 5, worstRating: 1 });
    expect(jsonLd.reviewBody).toBe("Loved every minute.");
  });

  it("omits reviewBody when not provided", () => {
    const jsonLd = reviewJsonLd({
      itemReviewed: { type: "Service", name: "Diagnostic Skin Analysis" },
      author: "Anonymous",
      ratingValue: 4,
      datePublished: "2026-02-01T00:00:00.000Z",
    });
    expect(jsonLd.reviewBody).toBeUndefined();
  });
});
