import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Hero } from "@/components/site/Hero";
import { Section } from "@/components/site/Section";
import { SectionHeading } from "@/components/site/SectionHeading";
import { CinematicImage } from "@/components/site/CinematicImage";
import { JourneySteps } from "@/components/site/JourneySteps";
import { Prose } from "@/components/site/Prose";
import { CtaBand } from "@/components/site/CtaBand";
import { JsonLd } from "@/components/seo/JsonLd";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/modules/seo/metadata";
import { breadcrumbJsonLd } from "@/modules/seo/jsonld";

interface AboutPageProps {
  params: Promise<{ locale: string }>;
}

interface StepMessage {
  title: string;
  body?: string;
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

// Fetches localized About-page metadata copy in both languages (mirroring
// the Home page's generateMetadata pattern) so buildMetadata can pick the
// right one while still emitting hreflang alternates for both.
export async function generateMetadata({ params }: AboutPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [tMetaEn, tMetaAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "about.meta" }),
    getTranslations({ locale: "ar", namespace: "about.meta" }),
  ]);

  return buildMetadata({
    locale,
    path: "/about",
    titleEn: tMetaEn("title"),
    titleAr: tMetaAr("title"),
    descEn: tMetaEn("description"),
    descAr: tMetaAr("description"),
  });
}

export default async function AboutPage({ params }: AboutPageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [tCommon, tNav, tHero, tStory, tPositioning, tJourney, tTeam, tCta] = await Promise.all([
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "about.hero" }),
    getTranslations({ locale, namespace: "about.story" }),
    getTranslations({ locale, namespace: "about.positioning" }),
    getTranslations({ locale, namespace: "home.journey" }),
    getTranslations({ locale, namespace: "about.team" }),
    getTranslations({ locale, namespace: "about.cta" }),
  ]);

  const bookHref = `/${locale}/book`;
  const appUrl = resolveAppUrl();

  const storyParagraphs = tStory.raw("paragraphs") as string[];
  const journeySteps = (tJourney.raw("steps") as StepMessage[]).map((step) => ({
    title: step.title,
    body: step.body,
  }));
  const teamRoles = tTeam.raw("roles") as string[];

  const breadcrumb = breadcrumbJsonLd([
    { name: tNav("home"), url: `${appUrl}/${locale}` },
    { name: tNav("about"), url: `${appUrl}/${locale}/about` },
  ]);

  return (
    <main className="flex flex-col">
      <JsonLd data={breadcrumb} />

      <Hero
        eyebrow={tHero("eyebrow")}
        headline={tHero("heading")}
        subhead={tHero("intro")}
        ctaLabel={tCommon("bookNow")}
        ctaHref={bookHref}
      />

      <Section tone="plain">
        <div className="flex flex-col gap-10">
          <SectionHeading eyebrow={tStory("eyebrow")} heading={tStory("heading")} align="center" className="mx-auto" />
          <Prose>
            {storyParagraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </Prose>
        </div>
      </Section>

      <CinematicImage
        src="/brand/experience-serum.jpg"
        alt={tPositioning("heading")}
        eyebrow={tPositioning("eyebrow")}
        headline={tPositioning("heading")}
        intro={tPositioning("body")}
      />

      <Section tone="plain">
        <JourneySteps eyebrow={tJourney("eyebrow")} heading={tJourney("heading")} steps={journeySteps} />
      </Section>

      <Section tone="tinted">
        <div className="flex flex-col gap-14">
          <SectionHeading eyebrow={tTeam("eyebrow")} heading={tTeam("heading")} intro={tTeam("intro")} />
          <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {teamRoles.map((role) => (
              <li
                key={role}
                className="flex flex-col gap-4 rounded-2xl border border-[var(--color-ink)]/10 bg-[var(--color-page)] px-6 py-8 text-start"
              >
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-cream)] to-[var(--color-teal)]/30"
                />
                <span className="font-[family-name:var(--font-display)] text-lg text-[var(--color-ink)]">{role}</span>
              </li>
            ))}
          </ul>
          <p className="max-w-2xl text-sm leading-relaxed text-[var(--color-ink)]/60">{tTeam("note")}</p>
        </div>
      </Section>

      <Section tone="plain">
        <CtaBand
          eyebrow={tCta("eyebrow")}
          headline={tCta("headline")}
          ctaLabel={tCommon("bookNow")}
          ctaHref={bookHref}
        />
      </Section>
    </main>
  );
}
