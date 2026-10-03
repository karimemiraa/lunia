import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { Department } from "@prisma/client";

import { MotionEdition, type MotionPanel } from "@/components/site/motion/MotionEdition";
import { getHomeHero, type PublicLocale } from "@/modules/cms/publicContent";
import { listDepartments } from "@/modules/catalog/departments";
import { localized } from "@/modules/catalog/localize";
import { buildMetadata } from "@/modules/seo/metadata";
import { departmentStill, type SiteMedia } from "@/lib/siteMedia";
import { getAggregate } from "@/modules/reviews/reviews";

export const dynamic = "force-dynamic";

interface V4PageProps {
  params: Promise<{ locale: string }>;
}
const isPublicLocale = (l: string): l is PublicLocale => l === "ar" || l === "en";
const stillSrc = (m: SiteMedia): string => ("src" in m && m.src ? m.src : "poster" in m && m.poster ? m.poster : "/media/treatment.webp");

export async function generateMetadata({ params }: V4PageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  const [tEn, tAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "home.meta" }),
    getTranslations({ locale: "ar", namespace: "home.meta" }),
  ]);
  return {
    ...buildMetadata({ locale, path: "/v4", titleEn: tEn("title"), titleAr: tAr("title"), descEn: tEn("description"), descAr: tAr("description") }),
    robots: { index: false, follow: false },
  };
}

// Motion Edition (preview): brand-flagship scroll choreography — a kinetic
// hero, a pinned horizontal journey track, a scrubbed statement, a marquee and
// count-up stats. Serene glass nav from the (motion) layout. Real content.
export default async function V4Home({ params }: V4PageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  const isAr = locale === "ar";

  const [hero, departments, aggregate, tCommon, tHero, tServices, tJourney, tValues, tCta] = await Promise.all([
    getHomeHero(locale),
    listDepartments({ publishedOnly: true }),
    getAggregate({}),
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "home.hero" }),
    getTranslations({ locale, namespace: "home.services" }),
    getTranslations({ locale, namespace: "home.journey" }),
    getTranslations({ locale, namespace: "home.values" }),
    getTranslations({ locale, namespace: "home.cta" }),
  ]);

  const panels: MotionPanel[] = departments.map((d: Department) => ({
    name: localized(locale, d.nameEn, d.nameAr),
    tagline: localized(locale, d.taglineEn, d.taglineAr),
    href: `/${locale}/services/${d.slug}`,
    src: stillSrc(departmentStill(d.slug)),
  }));

  const marquee = [
    ...departments.map((d: Department) => localized(locale, d.nameEn, d.nameAr)),
    isAr ? "تشخيص أولاً" : "Diagnostic-first",
    isAr ? "علامات طبية" : "Medical-grade",
    isAr ? "الرياض" : "Riyadh",
  ];

  return (
    <MotionEdition
      headline={hero.headline}
      eyebrow={tHero("eyebrow")}
      heroCaption={tHero("caption")}
      heroVideo={{ src: "/media/hero.mp4", mobileSrc: "/media/hero-m.mp4", poster: "/media/hero.jpg" }}
      panels={panels}
      statement={tCta("headline")}
      stats={[
        { value: departments.length, label: tValues("stats.departments") },
        { value: 6, label: tValues("stats.steps") },
        { value: aggregate.count > 0 ? Math.round(aggregate.avg * 10) / 10 : 5, label: isAr ? "تقييم العميلات" : "Client rating" },
        { value: 100, suffix: "%", label: tValues("stats.diagnostic") },
      ]}
      marquee={marquee}
      bookHref={`/${locale}/book`}
      labels={{
        book: tCommon("bookNow"),
        explore: tServices("explore"),
        scroll: isAr ? "مرّري للأسفل" : "Scroll",
        journey: tJourney("heading"),
      }}
    />
  );
}
