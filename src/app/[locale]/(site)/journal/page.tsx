import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { BlogPost } from "@prisma/client";

import { Section } from "@/components/site/Section";
import { CtaBand } from "@/components/site/CtaBand";
import { LocalNav } from "@/components/site/apple/LocalNav";
import { PageHero } from "@/components/site/apple/PageHero";
import { NewsTile } from "@/components/site/apple/NewsTile";
import { JsonLd } from "@/components/seo/JsonLd";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getMedia } from "@/modules/cms/media";
import { getEnv } from "@/lib/env";
import { listPublishedPosts } from "@/modules/catalog/journal";
import { localized } from "@/modules/catalog/localize";
import { buildMetadata } from "@/modules/seo/metadata";
import { breadcrumbJsonLd } from "@/modules/seo/jsonld";
import { journalStill, type SiteMedia } from "@/lib/siteMedia";

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

  const [posts, tCommon, tNav, tHero, tIndex, tCta, tUi] = await Promise.all([
    listPublishedPosts(),
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "journalIndex.hero" }),
    getTranslations({ locale, namespace: "journalIndex" }),
    getTranslations({ locale, namespace: "journalIndex.cta" }),
    getTranslations({ locale, namespace: "ui" }),
  ]);

  const bookHref = `/${locale}/book`;
  const appUrl = resolveAppUrl();

  const postCms = await Promise.all(posts.map((post: BlogPost) => resolveMedia(post.heroMediaId)));
  const postMedia: SiteMedia[] = posts.map((post: BlogPost, i: number) => {
    const cms = postCms[i];
    return cms ? { type: "cms", key: cms.key, kind: cms.kind } : journalStill(post.slug, i);
  });

  const breadcrumb = breadcrumbJsonLd([
    { name: tNav("home"), url: `${appUrl}/${locale}` },
    { name: tNav("journal"), url: `${appUrl}/${locale}/journal` },
  ]);

  const [featured, ...rest] = posts;

  return (
    <main className="flex flex-col">
      <JsonLd data={breadcrumb} />

      <LocalNav title={tNav("journal")} cta={{ href: bookHref, label: tUi("book") }} />

      <PageHero eyebrow={tHero("eyebrow")} title={tHero("heading")} lead={tHero("intro")} />

      <section className="bg-[#e8f1ee] pb-[clamp(5rem,12svh,8rem)] pt-[clamp(3.5rem,8svh,5.5rem)]">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-6">
          {posts.length === 0 || !featured ? (
            <p className="text-center text-base text-[var(--color-ink)]/60">{tIndex("emptyLabel")}</p>
          ) : (
            <>
              <h2 className="lx-display mb-8 text-[clamp(1.9rem,1.4rem+1.4vw,2.6rem)] text-[var(--color-ink)]">{tIndex("latest")}</h2>
              <NewsTile
                featured
                href={`/${locale}/journal/${featured.slug}`}
                media={postMedia[0]!}
                category={tIndex("category")}
                title={localized(locale, featured.titleEn, featured.titleAr)}
                excerpt={localized(locale, featured.excerptEn, featured.excerptAr)}
                date={formatDate(locale, featured.publishedAt) ?? undefined}
              />
              {rest.length > 0 && (
                <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {rest.map((post: BlogPost, i: number) => (
                    <NewsTile
                      key={post.id}
                      href={`/${locale}/journal/${post.slug}`}
                      media={postMedia[i + 1]!}
                      category={tIndex("category")}
                      title={localized(locale, post.titleEn, post.titleAr)}
                      excerpt={localized(locale, post.excerptEn, post.excerptAr)}
                      date={formatDate(locale, post.publishedAt) ?? undefined}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <Section tone="plain">
        <CtaBand eyebrow={tCta("eyebrow")} headline={tCta("headline")} ctaLabel={tCommon("bookNow")} ctaHref={bookHref} />
      </Section>
    </main>
  );
}
