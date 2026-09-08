import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";

import { Section } from "@/components/site/Section";
import { getBookableServices } from "@/modules/booking/serviceSettings";
import { getTierGateNotesForServices } from "@/modules/booking/accessRules";
import { localized } from "@/modules/catalog/localize";
import { buildMetadata } from "@/modules/seo/metadata";
import type { PublicLocale } from "@/modules/cms/publicContent";
import { BookingWizard, type BookableServiceDTO } from "./BookingWizard";

interface BookPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ src?: string | string[] }>;
}

function isPublicLocale(locale: string): locale is PublicLocale {
  return locale === "ar" || locale === "en";
}

// Attribution capture for Booking.sourceChannel: prefers an explicit `?src=`
// query param (e.g. from a paid campaign or QR code), falling back to the
// referrer's hostname, then "direct" if neither is present. Read once on the
// server so it's available before the client component even mounts.
async function resolveSourceChannel(searchParamsPromise: BookPageProps["searchParams"]): Promise<string> {
  const searchParams = await searchParamsPromise;
  const src = Array.isArray(searchParams.src) ? searchParams.src[0] : searchParams.src;
  if (src) return src.slice(0, 100);

  const referer = (await headers()).get("referer");
  if (referer) {
    try {
      return new URL(referer).hostname || "direct";
    } catch {
      // Malformed referer header — fall through to "direct".
    }
  }
  return "direct";
}

export async function generateMetadata({ params }: BookPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [tMetaEn, tMetaAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "book.meta" }),
    getTranslations({ locale: "ar", namespace: "book.meta" }),
  ]);

  return buildMetadata({
    locale,
    path: "/book",
    titleEn: tMetaEn("title"),
    titleAr: tMetaAr("title"),
    descEn: tMetaEn("description"),
    descAr: tMetaAr("description"),
  });
}

export default async function BookPage({ params, searchParams }: BookPageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [services, sourceChannel, tHero] = await Promise.all([
    getBookableServices(),
    resolveSourceChannel(searchParams),
    getTranslations({ locale, namespace: "book.hero" }),
  ]);

  const tierNotes = await getTierGateNotesForServices(services.map((service) => service.id));

  const serviceDTOs: BookableServiceDTO[] = services.map((service) => ({
    id: service.id,
    name: localized(locale, service.nameEn, service.nameAr),
    departmentName: localized(locale, service.department.nameEn, service.department.nameAr),
    durationMin: service.durationMin,
    priceMinor: service.priceMinor,
    tierNote: tierNotes[service.id] ?? null,
  }));

  return (
    <main className="flex flex-col">
      <Section tone="plain">
        <div className="flex flex-col gap-4 text-start">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-canopy)]">
            {tHero("eyebrow")}
          </span>
          <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.1] tracking-tight text-[var(--color-ink)] sm:text-5xl">
            {tHero("heading")}
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-[var(--color-ink)]/70 sm:text-lg">{tHero("intro")}</p>
        </div>
      </Section>

      <Section tone="plain">
        <BookingWizard services={serviceDTOs} locale={locale} sourceChannel={sourceChannel} />
      </Section>
    </main>
  );
}
