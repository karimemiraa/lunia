import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/site/Section";
import { JsonLd } from "@/components/seo/JsonLd";
import { ContactForm } from "./ContactForm";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getSetting } from "@/modules/cms/settings";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/modules/seo/metadata";
import { localBusinessJsonLd } from "@/modules/seo/jsonld";

interface ContactPageProps {
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

function digitsOnly(value: string): string {
  return value.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function instagramHref(handle: string): string {
  return handle.startsWith("http") ? handle : `https://instagram.com/${handle.replace(/^@/, "")}`;
}

const focusRingClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf7]";
const linkClass = `text-[var(--color-ink)] underline decoration-[var(--color-gold)] decoration-2 underline-offset-4 ${focusRingClass}`;

export async function generateMetadata({ params }: ContactPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [tMetaEn, tMetaAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "contact.meta" }),
    getTranslations({ locale: "ar", namespace: "contact.meta" }),
  ]);

  return buildMetadata({
    locale,
    path: "/contact",
    titleEn: tMetaEn("title"),
    titleAr: tMetaAr("title"),
    descEn: tMetaEn("description"),
    descAr: tMetaAr("description"),
  });
}

export default async function ContactPage({ params }: ContactPageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  const isAr = locale === "ar";

  const [business, social, tHero, tContact] = await Promise.all([
    getSetting("business").catch(() => null),
    getSetting("social").catch(() => null),
    getTranslations({ locale, namespace: "contact.hero" }),
    getTranslations({ locale, namespace: "contact" }),
  ]);

  const appUrl = resolveAppUrl();
  const contactUrl = `${appUrl}/${locale}/contact`;

  const businessName = business ? (isAr ? business.nameAr : business.nameEn) : null;
  const address = business ? (isAr ? business.addressAr : business.addressEn) : null;

  const localBusiness =
    business && social
      ? localBusinessJsonLd(business, social, { locale, url: contactUrl })
      : null;

  const mapQuery = address ? encodeURIComponent(address) : "Lunia Riyadh";
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;

  return (
    <main className="flex flex-col">
      {localBusiness && <JsonLd data={localBusiness} />}

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
        <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <div className="flex flex-col gap-10">
            <div className="flex flex-col gap-4 text-start">
              <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
                {tContact("napHeading")}
              </h2>

              {business ? (
                <dl className="flex flex-col gap-4 text-sm text-[var(--color-ink)]/75">
                  {businessName && (
                    <div>
                      <dt className="sr-only">{businessName}</dt>
                      <dd className="text-base font-medium text-[var(--color-ink)]">{businessName}</dd>
                    </div>
                  )}
                  {address && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ink)]/40">
                        {tContact("addressLabel")}
                      </dt>
                      <dd>
                        <address className="not-italic leading-relaxed">{address}</address>
                      </dd>
                    </div>
                  )}
                  {business.phone && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ink)]/40">
                        {tContact("phoneLabel")}
                      </dt>
                      <dd>
                        <a href={`tel:${digitsOnly(business.phone)}`} className={linkClass}>
                          {business.phone}
                        </a>
                      </dd>
                    </div>
                  )}
                  {business.whatsapp && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ink)]/40">
                        {tContact("whatsappLabel")}
                      </dt>
                      <dd>
                        <a
                          href={`https://wa.me/${digitsOnly(business.whatsapp)}`}
                          target="_blank"
                          rel="noreferrer"
                          className={linkClass}
                        >
                          {business.whatsapp}
                        </a>
                      </dd>
                    </div>
                  )}
                  {social?.instagram && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-ink)]/40">
                        {tContact("instagramLabel")}
                      </dt>
                      <dd>
                        <a href={instagramHref(social.instagram)} target="_blank" rel="noreferrer" className={linkClass}>
                          {social.instagram}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-[var(--color-ink)]/60">{tContact("napFallback")}</p>
              )}
            </div>

            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className={`group flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-2xl bg-gradient-to-br from-[var(--color-cream)] to-[var(--color-teal)]/25 p-8 text-center transition-opacity hover:opacity-90 ${focusRingClass}`}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8 fill-[var(--color-teal)]">
                <path d="M12 0c.6 4.8 2.6 8.2 6 9.6L24 12l-6 2.4c-3.4 1.4-5.4 4.8-6 9.6-.6-4.8-2.6-8.2-6-9.6L0 12l6-2.4C9.4 8.2 11.4 4.8 12 0Z" />
              </svg>
              <p className="text-sm text-[var(--color-ink)]/70">{tContact("mapPlaceholderLabel")}</p>
              <span className="text-sm font-medium text-[var(--color-ink)] underline decoration-[var(--color-gold)] decoration-2 underline-offset-4">
                {tContact("mapLinkLabel")}
              </span>
            </a>
          </div>

          <ContactForm />
        </div>
      </Section>
    </main>
  );
}
