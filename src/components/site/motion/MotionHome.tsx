import { getTranslations } from "next-intl/server";
import type { Department } from "@prisma/client";

import { MotionEdition, type MotionPanel } from "@/components/site/motion/MotionEdition";
import { getHomeHero, type PublicLocale } from "@/modules/cms/publicContent";
import { listDepartments } from "@/modules/catalog/departments";
import { localized } from "@/modules/catalog/localize";
import { departmentStill, type SiteMedia } from "@/lib/siteMedia";
import { getAggregate } from "@/modules/reviews/reviews";

const stillSrc = (m: SiteMedia): string => ("src" in m && m.src ? m.src : "poster" in m && m.poster ? m.poster : "/media/treatment.webp");

interface MotionHomeProps {
  locale: PublicLocale;
}

// The Motion Edition homepage body (data + MotionEdition) — shared by the /v4
// preview and the edition switcher.
export async function MotionHome({ locale }: MotionHomeProps) {
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
