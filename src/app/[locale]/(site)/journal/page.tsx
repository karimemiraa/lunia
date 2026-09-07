import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { BlogPost } from "@prisma/client";

import { Hero } from "@/components/site/Hero";
import { Section } from "@/components/site/Section";
import { MediaFrame } from "@/components/site/MediaFrame";
import { CtaBand } from "@/components/site/CtaBand";
import { JsonLd } from "@/components/seo/JsonLd";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getMedia } from "@/modules/cms/media";
import { getEnv } from "@/lib/env";
import { listPublishedPosts } from "@/modules/catalog/journal";
import { localized } from "@/modules/catalog/localize";
import { buildMetadata } from "@/modules/seo/metadata";
import { breadcrumbJsonLd } from "@/modules/seo/jsonld";

interface JournalPageProps {
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

async function resolveMedia(mediaId: string | null): Promise<{ key: string; kind: "IMAGE" | "VIDEO" } | null> {
  if (!mediaId) return null;
  const media = await getMedia(mediaId).catch(() => null);
  return media ? { key: media.storageKey, kind: media.kind } : null;
}

function formatDate(locale: PublicLocale, date: Date | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

export async function generateMetadata({ params }: JournalPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [tMetaEn, tMetaAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "journalIndex.meta" }),
    getTranslations({ locale: "ar", namespace: "journalIndex.meta" }),
  ]);

  return buildMetadata({
    locale,
    path: "/journal",
    titleEn: tMetaEn("title"),
    titleAr: tMetaAr("title"),
    descEn: tMetaEn("description"),
    descAr: tMetaAr("description"),
  });
}

export default async function JournalPage({ params }: JournalPageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [posts, tCommon, tNav, tHero, tIndex, tCta] = await Promise.all([
    listPublishedPosts(),
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "journalIndex.hero" }),
    getTranslations({ locale, namespace: "journalIndex" }),
    getTranslations({ locale, namespace: "journalIndex.cta" }),
  ]);

  const contactHref = `/${locale}/contact`;
  const appUrl = resolveAppUrl();

  const postMedia = await Promise.all(posts.map((post: BlogPost) => resolveMedia(post.heroMediaId)));

  const breadcrumb = breadcrumbJsonLd([
    { name: tNav("home"), url: `${appUrl}/${locale}` },
    { name: tNav("journal"), url: `${appUrl}/${locale}/journal` },
  ]);

  return (
    <main className="flex flex-col">
      <JsonLd data={breadcrumb} />

      <Hero
        eyebrow={tHero("eyebrow")}
        headline={tHero("heading")}
        subhead={tHero("intro")}
        ctaLabel={tCommon("bookNow")}
        ctaHref={contactHref}
      />

      <Section tone="plain">
        {posts.length === 0 ? (
          <p className="text-center text-base text-[var(--color-ink)]/60">{tIndex("emptyLabel")}</p>
        ) : (
          <div className="grid gap-x-10 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
            {posts.map((post: BlogPost, index: number) => {
              const href = `/${locale}/journal/${post.slug}`;
              const dateLabel = formatDate(locale, post.publishedAt);
              return (
                <article key={post.id} className="flex flex-col gap-4 text-start">
                  <Link href={href} className="block">
                    <MediaFrame
                      mediaKey={postMedia[index]?.key}
                      kind={postMedia[index]?.kind}
                      alt={localized(locale, post.titleEn, post.titleAr)}
                      aspectClassName="aspect-[4/3]"
                    />
                  </Link>
                  <div className="flex flex-col gap-2">
                    {dateLabel && (
                      <span className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-ink)]/40">
                        {dateLabel}
                      </span>
                    )}
                    <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--color-ink)]">
                      <Link href={href} className="hover:text-[var(--color-canopy)]">
                        {localized(locale, post.titleEn, post.titleAr)}
                      </Link>
                    </h2>
                    <p className="text-sm leading-relaxed text-[var(--color-ink)]/70">
                      {localized(locale, post.excerptEn, post.excerptAr)}
                    </p>
                  </div>
                  <Link
                    href={href}
                    className="inline-flex w-fit items-center gap-2 text-sm font-medium text-[var(--color-ink)] underline decoration-[var(--color-gold)] decoration-2 underline-offset-4"
                  >
                    {tIndex("readMoreLabel")}
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </Section>

      <Section tone="tinted">
        <CtaBand eyebrow={tCta("eyebrow")} headline={tCta("headline")} ctaLabel={tCommon("bookNow")} ctaHref={contactHref} />
      </Section>
    </main>
  );
}
