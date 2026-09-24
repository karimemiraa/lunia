import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Department, Service } from "@prisma/client";

import { Section } from "@/components/site/Section";
import { CtaBand } from "@/components/site/CtaBand";
import { DepartmentTiles } from "@/components/site/home/DepartmentTiles";
import { LocalNav } from "@/components/site/apple/LocalNav";
import { PageHero } from "@/components/site/apple/PageHero";
import { Chapter } from "@/components/site/apple/Chapter";
import { Gallery } from "@/components/site/apple/Gallery";
import { TreatmentCard } from "@/components/site/apple/TreatmentCard";
import { FeatureTiles, type FeatureTile } from "@/components/site/apple/FeatureTiles";
import { MediaCard } from "@/components/site/apple/MediaCard";
import { JsonLd } from "@/components/seo/JsonLd";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getMedia } from "@/modules/cms/media";
import { getEnv } from "@/lib/env";
import { listDepartments } from "@/modules/catalog/departments";
import { listServices } from "@/modules/catalog/services";
import { localized } from "@/modules/catalog/localize";
import { buildMetadata } from "@/modules/seo/metadata";
import { breadcrumbJsonLd } from "@/modules/seo/jsonld";
import { withFallbacks, departmentStill, serviceStill, formatSar, type SiteMedia } from "@/lib/siteMedia";

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

  const [departments, tCommon, tNav, tHero, tIndex, tCta, tUi] = await Promise.all([
    listDepartments({ publishedOnly: true }),
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "servicesIndex.hero" }),
    getTranslations({ locale, namespace: "servicesIndex" }),
    getTranslations({ locale, namespace: "servicesIndex.cta" }),
    getTranslations({ locale, namespace: "ui" }),
  ]);

  const bookHref = `/${locale}/book`;
  const appUrl = resolveAppUrl();

  const [departmentMedia, departmentServices] = await Promise.all([
    Promise.all(departments.map((department: Department) => resolveMedia(department.heroMediaId))),
    Promise.all(
      departments.map((department: Department) => listServices(department.id, { publishedOnly: true })),
    ),
  ]);
  const departmentTileMedia = withFallbacks(departmentMedia, (i) => departmentStill(departments[i]!.slug));
  const serviceMedia = await Promise.all(
    departmentServices.map((services) => Promise.all(services.map((service: Service) => resolveMedia(service.heroMediaId)))),
  );

  const breadcrumb = breadcrumbJsonLd([
    { name: tNav("home"), url: `${appUrl}/${locale}` },
    { name: tNav("services"), url: `${appUrl}/${locale}/services` },
  ]);

  const whyIcons = ["diagnose", "shield", "flask", "layers", "chart", "moon", "calendar", "gift"] as const;
  const whyTiles: FeatureTile[] = (tIndex.raw("why.tiles") as { title: string; body: string }[]).map((tile, i) => ({
    icon: whyIcons[i] ?? "sparkle",
    title: tile.title,
    body: tile.body,
    ...(i === 6 ? { href: bookHref, linkLabel: tIndex("why.bookLink") } : {}),
    ...(i === 7 ? { href: `/${locale}/gift-cards`, linkLabel: tIndex("why.giftLink") } : {}),
  }));

  const knowMedia: SiteMedia[] = [
    { type: "video", src: "/media/analyze.mp4", poster: "/media/analyze.jpg" },
    { type: "image", src: "/media/purity.webp" },
    { type: "image", src: "/media/sanctuary.webp" },
    { type: "video", src: "/media/hair.mp4", poster: "/media/hair.jpg" },
    { type: "video", src: "/media/recovery.mp4", poster: "/media/recovery.jpg" },
  ];
  const knowCards = tIndex.raw("know.cards") as { eyebrow: string; title: string }[];

  return (
    <main className="flex flex-col">
      <JsonLd data={breadcrumb} />

      <LocalNav
        title={tNav("services")}
        links={[
          { href: "#departments", label: tIndex("localNav.departments") },
          { href: "#treatments", label: tIndex("localNav.treatments") },
          { href: "#why", label: tIndex("localNav.why") },
        ]}
        cta={{ href: bookHref, label: tUi("book") }}
      />

      <PageHero
        eyebrow={tHero("eyebrow")}
        title={tHero("heading")}
        lead={tHero("intro")}
        cta={{ href: bookHref, label: tCommon("bookNow") }}
        secondary={{ href: "#treatments", label: tIndex("treatments.heading") }}
      />

      <DepartmentTiles
        id="departments"
        exploreLabel={tIndex("exploreLabel")}
        departments={departments.map((department: Department, index: number) => ({
          id: department.id,
          href: `/${locale}/services/${department.slug}`,
          name: localized(locale, department.nameEn, department.nameAr),
          tagline: localized(locale, department.taglineEn, department.taglineAr),
          media: departmentTileMedia[index]!,
        }))}
      />

      <Chapter
        id="treatments"
        tone="mist"
        eyebrow={tIndex("treatments.eyebrow")}
        heading={tIndex("treatments.heading")}
        lead={tIndex("treatments.intro")}
        bleed
      >
        <div className="flex flex-col gap-16 lg:gap-20">
          {departments.map((department: Department, dIndex: number) => {
            const services = departmentServices[dIndex] ?? [];
            if (services.length === 0) return null;
            const name = localized(locale, department.nameEn, department.nameAr);
            const deptHref = `/${locale}/services/${department.slug}`;
            return (
              <div key={department.id}>
                <div className="mx-auto mb-7 flex w-full max-w-7xl items-end justify-between gap-6 px-5 sm:px-6">
                  <h3 className="lx-display text-[clamp(1.8rem,1.3rem+1.4vw,2.6rem)] text-[var(--color-ink)]">{name}</h3>
                  <a href={deptHref} className="lx-link shrink-0 text-[0.95rem]">
                    {tIndex("treatments.seeAll")}
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m6 3 5 5-5 5" />
                    </svg>
                  </a>
                </div>
                <Gallery label={name} prevLabel={tUi("prev")} nextLabel={tUi("next")}>
                  {services.map((service: Service, sIndex: number) => {
                    const cms = serviceMedia[dIndex]?.[sIndex];
                    const media: SiteMedia = cms ? { type: "cms", key: cms.key, kind: cms.kind } : serviceStill(service.slug, department.slug);
                    const meta = [
                      tUi("minutes", { n: service.durationMin }),
                      service.priceMinor > 0 ? `${tUi("from")} ${formatSar(locale, service.priceMinor)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <TreatmentCard
                        key={service.id}
                        media={media}
                        name={localized(locale, service.nameEn, service.nameAr)}
                        summary={localized(locale, service.summaryEn, service.summaryAr)}
                        meta={meta}
                        learnHref={`${deptHref}#${service.slug}`}
                        learnLabel={tUi("learnMore")}
                        bookHref={`${bookHref}?service=${service.slug}`}
                        bookLabel={tUi("book")}
                        className="w-[82vw] sm:w-[21rem] lg:w-[23rem]"
                      />
                    );
                  })}
                </Gallery>
              </div>
            );
          })}
        </div>
      </Chapter>

      <Chapter id="why" tone="page" eyebrow={tIndex("why.eyebrow")} heading={tIndex("why.heading")}>
        <FeatureTiles tiles={whyTiles} columns={4} />
      </Chapter>

      <Chapter tone="white" eyebrow={tIndex("know.eyebrow")} heading={tIndex("know.heading")} bleed>
        <Gallery label={tIndex("know.heading")} prevLabel={tUi("prev")} nextLabel={tUi("next")}>
          {knowCards.map((card, i) => (
            <MediaCard
              key={card.title}
              media={knowMedia[i] ?? knowMedia[0]!}
              eyebrow={card.eyebrow}
              title={card.title}
              className="aspect-[3/4] w-[80vw] shrink-0 sm:w-[22rem] lg:w-[25rem]"
            />
          ))}
        </Gallery>
      </Chapter>

      <Section tone="plain">
        <CtaBand eyebrow={tCta("eyebrow")} headline={tCta("headline")} ctaLabel={tCommon("bookNow")} ctaHref={bookHref} />
      </Section>
    </main>
  );
}
