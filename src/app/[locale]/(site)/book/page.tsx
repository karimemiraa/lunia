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
  searchParams: Promise<{ src?: string | string[]; service?: string | string[]; staff?: string | string[] }>;
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

  const [services, sourceChannel, tHero, resolvedSearchParams] = await Promise.all([
    getBookableServices(),
    resolveSourceChannel(searchParams),
    getTranslations({ locale, namespace: "book.hero" }),
    searchParams,
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

  // One-tap rebooking deep-link (account page's "Book again"):
  // /book?service=<slug>&staff=<staffUserId>. Resolved server-side against
  // the actual bookable services list -- an unknown/stale slug or staff id
  // (e.g. the service was unpublished, or the staff member left) just falls
  // back to the normal step-1 flow rather than erroring.
  const serviceParam = Array.isArray(resolvedSearchParams.service) ? resolvedSearchParams.service[0] : resolvedSearchParams.service;
  const staffParam = Array.isArray(resolvedSearchParams.staff) ? resolvedSearchParams.staff[0] : resolvedSearchParams.staff;
  const prefillServiceId = serviceParam ? (services.find((s) => s.slug === serviceParam)?.id ?? null) : null;
  const prefillStaffUserId = prefillServiceId ? (staffParam ?? null) : null;

  return (
    <main className="flex flex-col">
      <section className="lunia-pattern-mosaic bg-[var(--color-page)] pb-[clamp(1.5rem,4svh,3rem)] pt-[clamp(4rem,10svh,7rem)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start px-5 sm:px-6">
          <span className="lx-eyebrow lunia-animate-fade-up">
            <span aria-hidden="true" className="lunia-glow-mark" />
            {tHero("eyebrow")}
          </span>
          <h1 className="lx-display lx-h1 lunia-animate-fade-up lunia-delay-1 mt-5 max-w-4xl text-[var(--color-ink)]">{tHero("heading")}</h1>
          <p className="lx-lead lunia-animate-fade-up lunia-delay-2 mt-6 max-w-2xl">{tHero("intro")}</p>
        </div>
      </section>

      <Section tone="plain">
        <BookingWizard
          services={serviceDTOs}
          locale={locale}
          sourceChannel={sourceChannel}
          prefillServiceId={prefillServiceId}
          prefillStaffUserId={prefillStaffUserId}
        />
      </Section>
    </main>
  );
}
