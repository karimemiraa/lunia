import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SereneHome } from "@/components/site/serene/SereneHome";
import type { PublicLocale } from "@/modules/cms/publicContent";
import { buildMetadata } from "@/modules/seo/metadata";

export const dynamic = "force-dynamic";

interface V2PageProps {
  params: Promise<{ locale: string }>;
}
const isPublicLocale = (l: string): l is PublicLocale => l === "ar" || l === "en";

export async function generateMetadata({ params }: V2PageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  const [tEn, tAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "home.meta" }),
    getTranslations({ locale: "ar", namespace: "home.meta" }),
  ]);
  return { ...buildMetadata({ locale, path: "/v2", titleEn: tEn("title"), titleAr: tAr("title"), descEn: tEn("description"), descAr: tAr("description") }), robots: { index: false, follow: false } };
}

export default async function V2Home({ params }: V2PageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  return <SereneHome locale={locale} />;
}
