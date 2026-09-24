import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/site/Section";
import { CtaBand } from "@/components/site/CtaBand";
import { Manifesto } from "@/components/site/home/Manifesto";
import { JourneySticky } from "@/components/site/home/JourneySticky";
import { LocalNav } from "@/components/site/apple/LocalNav";
import { PageHero } from "@/components/site/apple/PageHero";
import { Chapter } from "@/components/site/apple/Chapter";
import { MediaCard } from "@/components/site/apple/MediaCard";
import { FeatureTiles, type FeatureTile } from "@/components/site/apple/FeatureTiles";
import { JsonLd } from "@/components/seo/JsonLd";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getEnv } from "@/lib/env";
import { buildMetadata } from "@/modules/seo/metadata";
import { breadcrumbJsonLd } from "@/modules/seo/jsonld";
import type { SiteMedia } from "@/lib/siteMedia";

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

  const [tCommon, tNav, tHero, tStory, tPositioning, tJourney, tTeam, tCta, tAbout, tUi] = await Promise.all([
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "about.hero" }),
    getTranslations({ locale, namespace: "about.story" }),
    getTranslations({ locale, namespace: "about.positioning" }),
    getTranslations({ locale, namespace: "home.journey" }),
    getTranslations({ locale, namespace: "about.team" }),
    getTranslations({ locale, namespace: "about.cta" }),
    getTranslations({ locale, namespace: "about" }),
    getTranslations({ locale, namespace: "ui" }),
  ]);

  const bookHref = `/${locale}/book`;
  const appUrl = resolveAppUrl();

  const storyParagraphs = tStory.raw("paragraphs") as string[];
  const journeySteps = (tJourney.raw("steps") as StepMessage[]).map((step) => ({
    title: step.title,
    body: step.body,
  }));
  const teamIcons = ["diagnose", "sparkle", "heart", "user"] as const;
  const teamTiles: FeatureTile[] = (tTeam.raw("roles") as string[]).map((role, i) => ({ icon: teamIcons[i] ?? "user", title: role }));

  const guideMedia: SiteMedia[] = [
    { type: "image", src: "/media/glow.webp" },
    { type: "video", src: "/media/lounge.mp4", poster: "/media/lounge.jpg" },
    { type: "video", src: "/media/water.mp4", poster: "/media/water.jpg" },
    { type: "image", src: "/media/reveal.webp" },
  ];
  const guideCards = tAbout.raw("guides.cards") as { eyebrow: string; title: string; body: string }[];

  const breadcrumb = breadcrumbJsonLd([
    { name: tNav("home"), url: `${appUrl}/${locale}` },
    { name: tNav("about"), url: `${appUrl}/${locale}/about` },
  ]);

  return (
    <main className="flex flex-col">
      <JsonLd data={breadcrumb} />

      <LocalNav
        title={tNav("about")}
        links={[
          { href: "#story", label: tAbout("localNav.story") },
          { href: "#values", label: tAbout("localNav.values") },
          { href: "#journey", label: tAbout("localNav.journey") },
          { href: "#team", label: tAbout("localNav.team") },
        ]}
        cta={{ href: bookHref, label: tUi("book") }}
      />

      <PageHero
        eyebrow={tHero("eyebrow")}
        title={tHero("heading")}
        lead={tHero("intro")}
        cta={{ href: bookHref, label: tCommon("bookNow") }}
        secondary={{ href: "#story", label: tStory("heading") }}
        media={{ type: "video", src: "/media/hero.mp4", mobileSrc: "/media/hero-m.mp4", poster: "/media/hero.jpg" }}
      />

      <Manifesto eyebrow={tPositioning("eyebrow")} text={`${tPositioning("heading")} ${tPositioning("body")}`} />

      <Chapter id="story" tone="page">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
          <div className="lg:sticky lg:top-40 lg:self-start">
            <span className="lx-eyebrow">
              <span aria-hidden="true" className="lunia-glow-mark" />
              {tStory("eyebrow")}
            </span>
            <h2 data-splittext className="lx-display lx-h2 mt-5 text-[var(--color-ink)]">
              {tStory("heading")}
            </h2>
            <div data-clip className="mt-10 aspect-[4/3] overflow-hidden rounded-[28px]">
              {/* eslint-disable-next-line @next/next/no-img-element -- static brand media */}
              <img src="/media/treatment.webp" alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
            </div>
          </div>
          <div className="flex flex-col gap-8">
            {storyParagraphs.map((paragraph, index) => (
              <p
                key={index}
                data-reveal
                className={index === 0 ? "lx-display text-[clamp(1.6rem,1.2rem+1.3vw,2.3rem)] leading-[1.3] text-[var(--color-ink)]" : "text-[1.15rem] leading-[1.75] text-[var(--color-ink)]/75"}
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </Chapter>

      <Chapter id="values" tone="mist" eyebrow={tAbout("guides.eyebrow")} heading={tAbout("guides.heading")}>
        <div className="grid gap-4 sm:gap-5 md:grid-cols-2">
          {guideCards.map((card, i) => (
            <MediaCard
              key={card.title}
              media={guideMedia[i] ?? guideMedia[0]!}
              eyebrow={card.eyebrow}
              title={card.title}
              body={card.body}
              textAt="bottom"
              className="aspect-[4/3.4] md:aspect-[4/3.6]"
            />
          ))}
        </div>
      </Chapter>

      <JourneySticky id="journey" eyebrow={tJourney("eyebrow")} heading={tJourney("heading")} stepLabel={tJourney("stepLabel")} steps={journeySteps} />

      <Chapter id="team" tone="page" eyebrow={tTeam("eyebrow")} heading={tTeam("heading")} lead={tTeam("intro")}>
        <FeatureTiles tiles={teamTiles} columns={4} />
        <p className="mx-auto mt-10 max-w-2xl text-center text-[0.95rem] leading-relaxed text-[var(--color-ink)]/55">{tTeam("note")}</p>
      </Chapter>

      <Section tone="plain">
        <CtaBand eyebrow={tCta("eyebrow")} headline={tCta("headline")} ctaLabel={tCommon("bookNow")} ctaHref={bookHref} />
      </Section>
    </main>
  );
}
