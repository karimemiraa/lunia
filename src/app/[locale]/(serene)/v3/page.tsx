import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { CinematicHome } from "@/components/site/home/CinematicHome";
import type { PublicLocale } from "@/modules/cms/publicContent";
import { buildMetadata } from "@/modules/seo/metadata";

export const dynamic = "force-dynamic";

interface V3PageProps {
  params: Promise<{ locale: string }>;
}
const isPublicLocale = (l: string): l is PublicLocale => l === "ar" || l === "en";

export async function generateMetadata({ params }: V3PageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  const [tEn, tAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "home.meta" }),
    getTranslations({ locale: "ar", namespace: "home.meta" }),
  ]);
  // Preview — keep it out of search indexes.
  return {
    ...buildMetadata({ locale, path: "/v3", titleEn: tEn("title"), titleAr: tAr("title"), descEn: tEn("description"), descAr: tAr("description") }),
    robots: { index: false, follow: false },
  };
}

// Fusion preview: the Serene Edition's bespoke animated chrome (from the
// (serene) layout) wrapped around the original cinematic homepage — the video
// hero and the scroll-driven sections. Best of both.
export default async function V3Home({ params }: V3PageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  return <CinematicHome locale={locale} />;
}
