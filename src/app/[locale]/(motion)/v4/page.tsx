import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { MotionHome } from "@/components/site/motion/MotionHome";
import type { PublicLocale } from "@/modules/cms/publicContent";
import { buildMetadata } from "@/modules/seo/metadata";

export const dynamic = "force-dynamic";

interface V4PageProps {
  params: Promise<{ locale: string }>;
}
const isPublicLocale = (l: string): l is PublicLocale => l === "ar" || l === "en";

export async function generateMetadata({ params }: V4PageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  const [tEn, tAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "home.meta" }),
    getTranslations({ locale: "ar", namespace: "home.meta" }),
  ]);
  return { ...buildMetadata({ locale, path: "/v4", titleEn: tEn("title"), titleAr: tAr("title"), descEn: tEn("description"), descAr: tAr("description") }), robots: { index: false, follow: false } };
}

export default async function V4Home({ params }: V4PageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  return <MotionHome locale={locale} />;
}
