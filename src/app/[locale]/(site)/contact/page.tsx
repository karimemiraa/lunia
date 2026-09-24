import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { LocalNav } from "@/components/site/apple/LocalNav";
import { Chapter } from "@/components/site/apple/Chapter";
import { Icon, type IconName } from "@/components/site/apple/Icon";
import { Chevron } from "@/components/site/home/AppleHero";
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

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];

// Localized weekday name for a day key (2024-01-01 was a Monday).
function dayName(locale: PublicLocale, key: DayKey): string {
  const date = new Date(Date.UTC(2024, 0, 1 + DAY_KEYS.indexOf(key)));
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", { weekday: "long", timeZone: "UTC" }).format(date);
}

// Today's day key in Riyadh, regardless of the server's own timezone.
function todayInRiyadh(): DayKey {
  const short = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Riyadh" }).format(new Date());
  return short.toLowerCase().slice(0, 3) as DayKey;
}

export default async function ContactPage({ params }: ContactPageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  const isAr = locale === "ar";

  const [business, social, hours, tHero, tContact, tNav, tUi] = await Promise.all([
    getSetting("business").catch(() => null),
    getSetting("social").catch(() => null),
    getSetting("hours").catch(() => null),
    getTranslations({ locale, namespace: "contact.hero" }),
    getTranslations({ locale, namespace: "contact" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "ui" }),
  ]);

  const appUrl = resolveAppUrl();
  const contactUrl = `${appUrl}/${locale}/contact`;
  const bookHref = `/${locale}/book`;

  const businessName = business ? (isAr ? business.nameAr : business.nameEn) : null;
  const address = business ? (isAr ? business.addressAr : business.addressEn) : null;

  const localBusiness =
    business && social
      ? localBusinessJsonLd(business, social, { locale, url: contactUrl })
      : null;

  const mapQuery = address ? encodeURIComponent(address) : "Lunia Riyadh";
  const mapsHref = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  const whatsappHref = business?.whatsapp ? `https://wa.me/${digitsOnly(business.whatsapp)}` : null;
  const phoneHref = business?.phone ? `tel:${digitsOnly(business.phone)}` : null;

  const today = todayInRiyadh();
  const todayHours = hours?.[today];
  const status = todayHours
    ? todayHours.closed
      ? tContact("status.closed")
      : tContact("status.open", { open: todayHours.open, close: todayHours.close })
    : null;

  const strip: { icon: IconName; title: string; link: string; href: string; external?: boolean }[] = [
    { icon: "calendar", title: tContact("strip.book.title"), link: tContact("strip.book.link"), href: bookHref },
    ...(whatsappHref ? [{ icon: "chat" as const, title: tContact("strip.whatsapp.title"), link: tContact("strip.whatsapp.link"), href: whatsappHref, external: true }] : []),
    ...(phoneHref ? [{ icon: "phone" as const, title: tContact("strip.call.title"), link: tContact("strip.call.link"), href: phoneHref }] : []),
    { icon: "pin", title: tContact("strip.directions.title"), link: tContact("strip.directions.link"), href: mapsHref, external: true },
    { icon: "gift", title: tContact("strip.gift.title"), link: tContact("strip.gift.link"), href: `/${locale}/gift-cards` },
  ];

  const helpLinks = [
    { label: tContact("help.book"), href: bookHref },
    { label: tContact("help.services"), href: `/${locale}/services` },
    { label: tContact("help.journal"), href: `/${locale}/journal` },
    { label: tContact("help.gift"), href: `/${locale}/gift-cards` },
  ];

  const card = "flex flex-col rounded-[28px] bg-white p-8 sm:p-9";
  const cardHeading = "text-[0.8rem] font-semibold uppercase tracking-[0.16em] text-[var(--color-teal-ink)]";

  return (
    <main className="flex flex-col">
      {localBusiness && <JsonLd data={localBusiness} />}

      <LocalNav
        title={tNav("contact")}
        links={[
          { href: "#visit", label: tContact("localNav.visit") },
          { href: "#message", label: tContact("localNav.message") },
        ]}
        cta={{ href: bookHref, label: tUi("book") }}
      />

      <section className="bg-[var(--color-page)] pb-[clamp(3rem,8svh,5rem)] pt-[clamp(4.5rem,11svh,8rem)]">
        <div className="mx-auto flex max-w-5xl flex-col items-center px-6 text-center">
          <span className="lx-eyebrow lunia-animate-fade-up">
            <span aria-hidden="true" className="lunia-glow-mark" />
            {tHero("eyebrow")}
          </span>
          <h1 className="lx-display lx-h1 lunia-animate-fade-up lunia-delay-1 mt-5 text-[var(--color-ink)]">{tHero("heading")}</h1>
          {status && (
            <p className="lunia-animate-fade-up lunia-delay-2 mt-6 inline-flex items-center gap-2.5 text-[1.05rem] text-[var(--color-ink)]/70">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${todayHours?.closed ? "bg-[var(--color-gold)]" : "bg-[#3fae8a] shadow-[0_0_0_4px_rgba(63,174,138,0.18)]"}`} />
              {businessName ? `${businessName} · ` : ""}
              {status}
            </p>
          )}
          <p className="lx-lead lunia-animate-fade-up lunia-delay-3 mt-5 max-w-2xl">{tHero("intro")}</p>
        </div>

        {/* Apple Store-style service strip */}
        <ul className="mx-auto mt-12 grid max-w-6xl grid-cols-2 gap-x-4 gap-y-8 px-6 sm:grid-cols-3 lg:grid-cols-5">
          {strip.map((item) => (
            <li key={item.title} data-reveal className="flex flex-col items-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-teal)]/25 text-[var(--color-teal-ink)]">
                <Icon name={item.icon} />
              </span>
              <span className="mt-3 text-[0.95rem] font-semibold text-[var(--color-ink)]">{item.title}</span>
              <a
                href={item.href}
                {...(item.external ? { target: "_blank", rel: "noreferrer" } : {})}
                className="lx-link mt-1 text-[0.9rem]"
              >
                {item.link}
                <Chevron />
              </a>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-[clamp(3rem,8svh,5rem)] w-full max-w-7xl px-4 sm:px-6">
          <div data-grow className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-[var(--color-ice)] sm:aspect-[21/9]">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand media */}
            <img src="/media/clinic-corridor.webp" alt="" className="h-full w-full object-cover" />
          </div>
        </div>
      </section>

      <Chapter id="visit" tone="mist">
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
          <div data-reveal className={card}>
            <h2 className={cardHeading}>{tContact("addressLabel")}</h2>
            {business ? (
              <>
                {businessName && <p className="lx-display mt-4 text-[1.9rem] text-[var(--color-ink)]">{businessName}</p>}
                {address && <address className="mt-2 not-italic leading-relaxed text-[var(--color-ink)]/70">{address}</address>}
                {business.phone && phoneHref && (
                  <a href={phoneHref} className="mt-4 text-[1.05rem] font-medium text-[var(--color-ink)]" dir="ltr">
                    {business.phone}
                  </a>
                )}
              </>
            ) : (
              <p className="mt-4 text-sm text-[var(--color-ink)]/60">{tContact("napFallback")}</p>
            )}
            <a href={mapsHref} target="_blank" rel="noreferrer" className="lx-link mt-auto pt-6">
              {tContact("mapLinkLabel")}
              <Chevron />
            </a>
          </div>

          {hours && (
            <div data-reveal className={card}>
              <h2 className={cardHeading}>{tContact("hoursHeading")}</h2>
              <dl className="mt-4 flex flex-col">
                {DAY_KEYS.map((key) => {
                  const h = hours[key];
                  const isToday = key === today;
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between gap-4 border-b border-[var(--color-ink)]/[0.07] py-2.5 text-[0.975rem] last:border-0 ${isToday ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-ink)]/70"}`}
                    >
                      <dt>{dayName(locale, key)}</dt>
                      <dd dir="ltr">{h.closed ? tContact("closedLabel") : `${h.open} – ${h.close}`}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}

          <div data-reveal className={card}>
            <h2 className={cardHeading}>{tContact("helpHeading")}</h2>
            <ul className="mt-4 flex flex-col">
              {helpLinks.map((l) => (
                <li key={l.href} className="border-b border-[var(--color-ink)]/[0.07] last:border-0">
                  <Link href={l.href} className="group flex items-center justify-between gap-4 py-3.5 text-[1.02rem] text-[var(--color-ink)] transition-colors hover:text-[var(--color-teal-ink)]">
                    {l.label}
                    <span className="text-[var(--color-teal-ink)] [&_svg]:h-4 [&_svg]:w-4 rtl:[&_svg]:-scale-x-100">
                      <Chevron />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Chapter>

      <Chapter id="message" tone="page">
        <div className="mx-auto max-w-3xl">
          <ContactForm />
        </div>
      </Chapter>
    </main>
  );
}
