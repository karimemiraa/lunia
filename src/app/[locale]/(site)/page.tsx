import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CinematicHome } from "@/components/site/home/CinematicHome";
import type { PublicLocale } from "@/modules/cms/publicContent";
import { getSetting } from "@/modules/cms/settings";
import { buildMetadata } from "@/modules/seo/metadata";

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

export default async function Home({ params }: HomePageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  return <CinematicHome locale={locale} />;
}
