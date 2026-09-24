import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { Department, Service } from "@prisma/client";

import { Section } from "@/components/site/Section";
import { CtaBand } from "@/components/site/CtaBand";
import { Faq } from "@/components/site/Faq";
import { DepartmentTiles } from "@/components/site/home/DepartmentTiles";
import { LocalNav } from "@/components/site/apple/LocalNav";
import { PageHero } from "@/components/site/apple/PageHero";
import { Chapter } from "@/components/site/apple/Chapter";
import { Gallery } from "@/components/site/apple/Gallery";
import { MediaCard } from "@/components/site/apple/MediaCard";
import { Statement } from "@/components/site/apple/Statement";
import { FeatureRow } from "@/components/site/apple/FeatureRow";
import { FeatureTiles, type FeatureTile } from "@/components/site/apple/FeatureTiles";
import { JsonLd } from "@/components/seo/JsonLd";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getMedia } from "@/modules/cms/media";
import { getEnv } from "@/lib/env";
import { getDepartmentBySlug, listDepartments } from "@/modules/catalog/departments";
import { localized, localizedList } from "@/modules/catalog/localize";
import { buildMetadata } from "@/modules/seo/metadata";
import { breadcrumbJsonLd, serviceJsonLd, faqPageJsonLd, aggregateRatingJsonLd } from "@/modules/seo/jsonld";
import { getAggregate } from "@/modules/reviews/reviews";
import { DEPARTMENT_FILM, departmentStill, serviceStill, withFallbacks, formatSar, type SiteMedia } from "@/lib/siteMedia";

interface DepartmentPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

interface FaqMessage {
  q: string;
  a: string;
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

// Pre-renders every published department for both locales at build time.
export async function generateMetadata({ params }: DepartmentPageProps): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const department = await getDepartmentBySlug(slug);
  if (!department || !department.isPublished) {
    return { title: "Not found" };
  }

  const [tBrandEn, tBrandAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "common" }),
    getTranslations({ locale: "ar", namespace: "common" }),
  ]);

  return buildMetadata({
    locale,
    path: `/services/${department.slug}`,
    titleEn: `${department.nameEn} | ${tBrandEn("brandName")}`,
    titleAr: `${department.nameAr} | ${tBrandAr("brandName")}`,
    descEn: department.descEn,
    descAr: department.descAr,
  });
}

export default async function DepartmentPage({ params }: DepartmentPageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const department = await getDepartmentBySlug(slug);
  if (!department || !department.isPublished) {
    notFound();
  }

  const [tCommon, tNav, tDept, tFaq, tUi, tIndex, allDepartments] = await Promise.all([
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "serviceDepartment" }),
    getTranslations({ locale, namespace: "serviceDepartment.faq" }),
    getTranslations({ locale, namespace: "ui" }),
    getTranslations({ locale, namespace: "servicesIndex" }),
    listDepartments({ publishedOnly: true }),
  ]);

  const bookHref = `/${locale}/book`;
  const appUrl = resolveAppUrl();
  const departmentUrl = `${appUrl}/${locale}/services/${department.slug}`;

  const services = department.services.filter((service: Service) => service.isPublished);
  const serviceCms = await Promise.all(services.map((service: Service) => resolveMedia(service.heroMediaId)));
  const serviceMedia: SiteMedia[] = services.map((service: Service, i: number) => {
    const cms = serviceCms[i];
    return cms ? { type: "cms", key: cms.key, kind: cms.kind } : serviceStill(service.slug, department.slug);
  });
  const heroFilm = DEPARTMENT_FILM[department.slug] ?? departmentStill(department.slug);

  // The other departments ("All in the family"), never repeating a photo.
  const otherDepartments = allDepartments.filter((d: Department) => d.id !== department.id);
  const otherCms = await Promise.all(otherDepartments.map((d: Department) => resolveMedia(d.heroMediaId)));
  const otherMedia = withFallbacks(otherCms, (i) => departmentStill(otherDepartments[i]!.slug));

  const metaFor = (service: Service) =>
    [tUi("minutes", { n: service.durationMin }), service.priceMinor > 0 ? `${tUi("from")} ${formatSar(locale, service.priceMinor)}` : null]
      .filter(Boolean)
      .join(" · ");

  const whyAll = tIndex.raw("why.tiles") as { title: string; body: string }[];
  const whyTiles: FeatureTile[] = (
    [
      [0, "diagnose"],
      [1, "shield"],
      [3, "layers"],
      [4, "chart"],
    ] as const
  ).map(([i, icon]) => ({ icon, title: whyAll[i]!.title, body: whyAll[i]!.body }));

  const departmentName = localized(locale, department.nameEn, department.nameAr);
  const faqItems = tFaq.raw("items") as FaqMessage[];

  const breadcrumb = breadcrumbJsonLd([
    { name: tNav("home"), url: `${appUrl}/${locale}` },
    { name: tNav("services"), url: `${appUrl}/${locale}/services` },
    { name: departmentName, url: departmentUrl },
  ]);

  const serviceEntities = services.map((service) =>
    serviceJsonLd({
      name: localized(locale, service.nameEn, service.nameAr),
      description: localized(locale, service.summaryEn, service.summaryAr),
      url: `${departmentUrl}#${service.slug}`,
      provider: tCommon("brandName"),
    }),
  );

  const faqEntity = faqItems.length > 0 ? faqPageJsonLd(faqItems.map(({ q, a }) => ({ q, a }))) : null;

  // Resolves the Stage-3 AggregateRating deferral for this department's
  // services: one AggregateRating entity per service that already has
  // published (APPROVED + consentPublic) reviews. Never emitted for a
  // service with zero reviews.
  const serviceAggregates = await Promise.all(services.map((service) => getAggregate({ serviceId: service.id })));
  const aggregateRatingEntities = services
    .map((service, index) => ({ service, aggregate: serviceAggregates[index]! }))
    .filter(({ aggregate }) => aggregate.count > 0)
    .map(({ service, aggregate }) =>
      aggregateRatingJsonLd({
        itemReviewed: {
          type: "Service",
          name: localized(locale, service.nameEn, service.nameAr),
          url: `${departmentUrl}#${service.slug}`,
        },
        ratingValue: aggregate.avg,
        reviewCount: aggregate.count,
      }),
    );

  return (
    <main className="flex flex-col">
      <JsonLd data={[breadcrumb, ...serviceEntities, ...(faqEntity ? [faqEntity] : []), ...aggregateRatingEntities]} />

      <LocalNav
        title={departmentName}
        titleHref={`/${locale}/services`}
        links={[
          { href: "#overview", label: tDept("localNav.overview") },
          { href: "#treatments", label: tDept("localNav.treatments") },
          ...(faqItems.length > 0 ? [{ href: "#faq", label: tDept("localNav.faq") }] : []),
        ]}
        cta={{ href: bookHref, label: tUi("book") }}
      />

      <PageHero
        eyebrow={tNav("services")}
        title={departmentName}
        lead={localized(locale, department.taglineEn, department.taglineAr)}
        cta={{ href: bookHref, label: tCommon("bookNow") }}
        secondary={{ href: "#treatments", label: tDept("treatmentsHeading") }}
        media={heroFilm}
        mediaAlt={departmentName}
      />

      {services.length > 0 && (
        <Chapter tone="white" heading={tDept("highlights")} align="start" bleed>
          <Gallery label={tDept("highlights")} prevLabel={tUi("prev")} nextLabel={tUi("next")}>
            {services.map((service: Service, i: number) => (
              <MediaCard
                key={service.id}
                media={serviceMedia[i]!}
                eyebrow={tUi("minutes", { n: service.durationMin })}
                title={localized(locale, service.nameEn, service.nameAr)}
                body={localized(locale, service.summaryEn, service.summaryAr)}
                href={`#${service.slug}`}
                textAt="bottom"
                className="aspect-[3/4] w-[80vw] shrink-0 sm:w-[22rem] lg:w-[25rem]"
              />
            ))}
          </Gallery>
        </Chapter>
      )}

      <Statement id="overview" eyebrow={tDept("overview")} text={localized(locale, department.descEn, department.descAr)} />

      <Chapter
        id="treatments"
        tone="mist"
        eyebrow={tDept("treatmentsEyebrow")}
        heading={tDept("treatmentsHeading")}
        lead={tDept("servicesIntro")}
      >
        {services.length === 0 ? (
          <p className="text-center text-base text-[var(--color-ink)]/60">{tDept("emptyServices")}</p>
        ) : (
          <div className="flex flex-col gap-20 lg:gap-28">
            {services.map((service: Service, i: number) => (
              <FeatureRow
                key={service.id}
                id={service.slug}
                media={serviceMedia[i]!}
                title={localized(locale, service.nameEn, service.nameAr)}
                body={localized(locale, service.summaryEn, service.summaryAr)}
                meta={metaFor(service)}
                bullets={localizedList(locale, service.benefitsEn, service.benefitsAr)}
                cta={{ href: `${bookHref}?service=${service.slug}`, label: tDept("bookThis") }}
                flip={i % 2 === 1}
              />
            ))}
          </div>
        )}
      </Chapter>

      <Chapter tone="page" heading={tDept("whyHeading")}>
        <FeatureTiles tiles={whyTiles} columns={4} />
      </Chapter>

      {faqItems.length > 0 && (
        <Chapter id="faq" tone="white" heading={tFaq("heading")}>
          <Faq items={faqItems} />
        </Chapter>
      )}

      {otherDepartments.length > 0 && (
        <DepartmentTiles
          heading={tDept("family")}
          exploreLabel={tIndex("exploreLabel")}
          departments={otherDepartments.map((d: Department, i: number) => ({
            id: d.id,
            href: `/${locale}/services/${d.slug}`,
            name: localized(locale, d.nameEn, d.nameAr),
            tagline: localized(locale, d.taglineEn, d.taglineAr),
            media: otherMedia[i]!,
          }))}
        />
      )}

      <Section tone="plain">
        <CtaBand
          eyebrow={tDept("cta.eyebrow")}
          headline={tDept("cta.headline")}
          ctaLabel={tCommon("bookNow")}
          ctaHref={bookHref}
        />
      </Section>
    </main>
  );
}
