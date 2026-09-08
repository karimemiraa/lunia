import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Department, Service } from "@prisma/client";

import { Hero } from "@/components/site/Hero";
import { Section } from "@/components/site/Section";
import { CtaBand } from "@/components/site/CtaBand";
import { MediaFrame } from "@/components/site/MediaFrame";
import { JsonLd } from "@/components/seo/JsonLd";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getMedia } from "@/modules/cms/media";
import { getEnv } from "@/lib/env";
import { listDepartments } from "@/modules/catalog/departments";
import { listServices } from "@/modules/catalog/services";
import { localized } from "@/modules/catalog/localize";
import { buildMetadata } from "@/modules/seo/metadata";
import { breadcrumbJsonLd } from "@/modules/seo/jsonld";

interface ServicesPageProps {
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

export async function generateMetadata({ params }: ServicesPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [tMetaEn, tMetaAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "servicesIndex.meta" }),
    getTranslations({ locale: "ar", namespace: "servicesIndex.meta" }),
  ]);

  return buildMetadata({
    locale,
    path: "/services",
    titleEn: tMetaEn("title"),
    titleAr: tMetaAr("title"),
    descEn: tMetaEn("description"),
    descAr: tMetaAr("description"),
  });
}

export default async function ServicesPage({ params }: ServicesPageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [departments, tCommon, tNav, tHero, tIndex, tCta] = await Promise.all([
    listDepartments({ publishedOnly: true }),
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "servicesIndex.hero" }),
    getTranslations({ locale, namespace: "servicesIndex" }),
    getTranslations({ locale, namespace: "servicesIndex.cta" }),
  ]);

  const contactHref = `/${locale}/contact`;
  const appUrl = resolveAppUrl();

  const [departmentMedia, departmentServices] = await Promise.all([
    Promise.all(departments.map((department: Department) => resolveMedia(department.heroMediaId))),
    Promise.all(
      departments.map((department: Department) => listServices(department.id, { publishedOnly: true })),
    ),
  ]);

  const breadcrumb = breadcrumbJsonLd([
    { name: tNav("home"), url: `${appUrl}/${locale}` },
    { name: tNav("services"), url: `${appUrl}/${locale}/services` },
  ]);

  return (
    <main className="flex flex-col">
      <JsonLd data={breadcrumb} />

      <Hero
        eyebrow={tHero("eyebrow")}
        headline={tHero("heading")}
        subhead={tHero("intro")}
        ctaLabel={tCommon("bookNow")}
        ctaHref={contactHref}
      />

      <Section tone="plain">
        <div className="flex flex-col gap-20">
          {departments.map((department: Department, index: number) => {
            const services = departmentServices[index];
            const href = `/${locale}/services/${department.slug}`;
            return (
              <article key={department.id} className="flex flex-col gap-8 sm:flex-row sm:gap-12">
                <MediaFrame
                  mediaKey={departmentMedia[index]?.key}
                  kind={departmentMedia[index]?.kind}
                  alt={localized(locale, department.nameEn, department.nameAr)}
                  aspectClassName="aspect-[4/3]"
                  className="w-full sm:w-72 sm:shrink-0"
                />
                <div className="flex flex-1 flex-col gap-5 text-start">
                  <div className="flex flex-col gap-2">
                    <h2 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)] sm:text-4xl">
                      <Link href={href} className="hover:text-[var(--color-canopy)]">
                        {localized(locale, department.nameEn, department.nameAr)}
                      </Link>
                    </h2>
                    <p className="text-base leading-relaxed text-[var(--color-ink)]/70">
                      {localized(locale, department.taglineEn, department.taglineAr)}
                    </p>
                  </div>

                  {services.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-ink)]/40">
                        {tIndex("servicesLabel")}
                      </span>
                      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--color-ink)]/70">
                        {services.slice(0, 4).map((service: Service) => (
                          <li key={service.id} className="after:ms-3 after:text-[var(--color-ink)]/30 after:content-['·'] last:after:content-none">
                            {localized(locale, service.nameEn, service.nameAr)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Link
                    href={href}
                    className="inline-flex w-fit items-center gap-2 text-sm font-medium text-[var(--color-ink)] underline decoration-[var(--color-gold)] decoration-2 underline-offset-4"
                  >
                    {tIndex("exploreLabel")}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <Section tone="tinted">
        <CtaBand eyebrow={tCta("eyebrow")} headline={tCta("headline")} ctaLabel={tCommon("bookNow")} ctaHref={contactHref} />
      </Section>
    </main>
  );
}
