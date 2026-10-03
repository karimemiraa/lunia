import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CinematicHome } from "@/components/site/home/CinematicHome";
import { SereneHome } from "@/components/site/serene/SereneHome";
import { MotionHome } from "@/components/site/motion/MotionHome";
import type { PublicLocale } from "@/modules/cms/publicContent";
import { getSetting } from "@/modules/cms/settings";
import { buildMetadata } from "@/modules/seo/metadata";

export const dynamic = "force-dynamic";

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

function isPublicLocale(locale: string): locale is PublicLocale {
  return locale === "ar" || locale === "en";
}

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

// The live homepage. Its design is chosen by the "edition" appearance setting
// (switchable in Superadmin): classic & cinematic share the cinematic body,
// soft is the Soft-UI design, motion is the flagship scroll experience. The
// layout picks the matching chrome.
export default async function Home({ params }: HomePageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  const edition = (await getSetting("appearance").catch(() => null))?.edition ?? "cinematic";

  if (edition === "soft") return <SereneHome locale={locale} />;
  if (edition === "motion") return <MotionHome locale={locale} />;
  return <CinematicHome locale={locale} />;
}
