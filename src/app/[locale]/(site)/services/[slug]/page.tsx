import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import type { Service } from "@prisma/client";

import { Section } from "@/components/site/Section";
import { SectionHeading } from "@/components/site/SectionHeading";
import { CtaBand } from "@/components/site/CtaBand";
import { Faq } from "@/components/site/Faq";
import { MediaFrame } from "@/components/site/MediaFrame";
import { JsonLd } from "@/components/seo/JsonLd";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getMedia } from "@/modules/cms/media";
import { getEnv } from "@/lib/env";
import { routing } from "@/i18n/routing";
import { listDepartments, getDepartmentBySlug } from "@/modules/catalog/departments";
import { localized, localizedList } from "@/modules/catalog/localize";
import { buildMetadata } from "@/modules/seo/metadata";
import { breadcrumbJsonLd, serviceJsonLd, faqPageJsonLd, aggregateRatingJsonLd } from "@/modules/seo/jsonld";
import { getAggregate } from "@/modules/reviews/reviews";

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
export async function generateStaticParams() {
  const departments = await listDepartments({ publishedOnly: true });
  return routing.locales.flatMap((locale) =>
    departments.map((department) => ({ locale, slug: department.slug })),
  );
}

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

  const [tCommon, tNav, tDept, tFaq] = await Promise.all([
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "serviceDepartment" }),
    getTranslations({ locale, namespace: "serviceDepartment.faq" }),
  ]);

  const bookHref = `/${locale}/book`;
  const appUrl = resolveAppUrl();
  const departmentUrl = `${appUrl}/${locale}/services/${department.slug}`;

  const heroMedia = await resolveMedia(department.heroMediaId);
  const services = department.services.filter((service: Service) => service.isPublished);

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

      <Section tone="plain">
        <div className="grid gap-10 sm:grid-cols-[1.1fr_1fr] sm:items-center sm:gap-16">
          <div className="flex flex-col gap-6 text-start">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-canopy)]">
              {tNav("services")}
            </span>
            <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.1] tracking-tight text-[var(--color-ink)] sm:text-5xl">
              {departmentName}
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-[var(--color-ink)]/70 sm:text-lg">
              {localized(locale, department.taglineEn, department.taglineAr)}
            </p>
            <p className="max-w-xl text-base leading-relaxed text-[var(--color-ink)]/70">
              {localized(locale, department.descEn, department.descAr)}
            </p>
          </div>
          <MediaFrame
            mediaKey={heroMedia?.key}
            kind={heroMedia?.kind}
            alt={departmentName}
            aspectClassName="aspect-[4/5] sm:aspect-[4/5]"
          />
        </div>
      </Section>

      <Section tone="plain">
        <div className="flex flex-col gap-14">
          <SectionHeading heading={tDept("servicesHeading")} intro={tDept("servicesIntro")} />

          {services.length === 0 ? (
            <p className="text-base text-[var(--color-ink)]/60">{tDept("emptyServices")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--color-ink)]/10">
              {services.map((service: Service) => {
                const benefits = localizedList(locale, service.benefitsEn, service.benefitsAr);
                return (
                  <li key={service.id} id={service.slug} className="flex flex-col gap-4 py-10 first:pt-0 last:pb-0">
                    <h3 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)] sm:text-3xl">
                      {localized(locale, service.nameEn, service.nameAr)}
                    </h3>
                    <p className="max-w-2xl text-base leading-relaxed text-[var(--color-ink)]/70">
                      {localized(locale, service.summaryEn, service.summaryAr)}
                    </p>
                    {benefits.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-ink)]/40">
                          {tDept("benefitsLabel")}
                        </span>
                        <ul className="grid gap-x-8 gap-y-2 text-sm text-[var(--color-ink)]/75 sm:grid-cols-2">
                          {benefits.map((benefit) => (
                            <li key={benefit} className="flex items-start gap-2">
                              <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--color-gold)]" />
                              {benefit}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>

      {faqItems.length > 0 && (
        <Section tone="tinted">
          <div className="flex flex-col gap-10">
            <SectionHeading heading={tFaq("heading")} align="center" className="mx-auto" />
            <Faq items={faqItems} />
          </div>
        </Section>
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
