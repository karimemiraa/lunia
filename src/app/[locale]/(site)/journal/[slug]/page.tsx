import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import type { BlogPost } from "@prisma/client";
import { Section } from "@/components/site/Section";
import { CtaBand } from "@/components/site/CtaBand";
import { LocalNav } from "@/components/site/apple/LocalNav";
import { NewsTile } from "@/components/site/apple/NewsTile";
import { SmartMedia } from "@/components/site/apple/SmartMedia";
import { JsonLd } from "@/components/seo/JsonLd";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getMedia } from "@/modules/cms/media";
import { getEnv } from "@/lib/env";
import { getPostBySlug, listPublishedPosts } from "@/modules/catalog/journal";
import { localized } from "@/modules/catalog/localize";
import { buildMetadata } from "@/modules/seo/metadata";
import { breadcrumbJsonLd, articleJsonLd } from "@/modules/seo/jsonld";
import { journalStill, type SiteMedia } from "@/lib/siteMedia";

interface JournalPostPageProps {
  params: Promise<{ locale: string; slug: string }>;
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

export async function generateMetadata({ params }: JournalPostPageProps): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const post = await getPostBySlug(slug);
  if (!post || !post.isPublished) {
    return { title: "Not found" };
  }

  const [tBrandEn, tBrandAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "common" }),
    getTranslations({ locale: "ar", namespace: "common" }),
  ]);

  return buildMetadata({
    locale,
    path: `/journal/${post.slug}`,
    titleEn: `${post.titleEn} | ${tBrandEn("brandName")}`,
    titleAr: `${post.titleAr} | ${tBrandAr("brandName")}`,
    descEn: post.excerptEn,
    descAr: post.excerptAr,
  });
}

export default async function JournalPostPage({ params }: JournalPostPageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const post = await getPostBySlug(slug);
  if (!post || !post.isPublished) {
    notFound();
  }

  const [tCommon, tNav, tPost, tIndex, tUi, allPosts] = await Promise.all([
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "journalPost" }),
    getTranslations({ locale, namespace: "journalIndex" }),
    getTranslations({ locale, namespace: "ui" }),
    listPublishedPosts(),
  ]);

  const bookHref = `/${locale}/book`;
  const appUrl = resolveAppUrl();
  const postUrl = `${appUrl}/${locale}/journal/${post.slug}`;

  const postIndex = allPosts.findIndex((p: BlogPost) => p.id === post.id);
  const heroCms = await resolveMedia(post.heroMediaId);
  const heroMedia: SiteMedia = heroCms ? { type: "cms", key: heroCms.key, kind: heroCms.kind } : journalStill(post.slug, Math.max(postIndex, 0));

  // "More from the Blog" — up to three other stories, keeping each one's cover.
  const more = allPosts
    .map((p: BlogPost, i: number) => ({ p, i }))
    .filter(({ p }) => p.id !== post.id)
    .slice(0, 3);
  const moreCms = await Promise.all(more.map(({ p }) => resolveMedia(p.heroMediaId)));

  const title = localized(locale, post.titleEn, post.titleAr);
  const body = localized(locale, post.bodyEn, post.bodyAr);
  const dateLabel = formatDate(locale, post.publishedAt);

  const breadcrumb = breadcrumbJsonLd([
    { name: tNav("home"), url: `${appUrl}/${locale}` },
    { name: tNav("journal"), url: `${appUrl}/${locale}/journal` },
    { name: title, url: postUrl },
  ]);

  const article = articleJsonLd({
    headline: title,
    description: localized(locale, post.excerptEn, post.excerptAr),
    url: postUrl,
    datePublished: (post.publishedAt ?? post.createdAt).toISOString(),
    author: post.authorName ?? tCommon("brandName"),
  });

  // Post bodies are plain text with paragraphs separated by blank lines —
  // split rather than dangerouslySetInnerHTML so we never render raw HTML.
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <main className="flex flex-col">
      <JsonLd data={[breadcrumb, article]} />

      <LocalNav title={tNav("journal")} titleHref={`/${locale}/journal`} cta={{ href: bookHref, label: tUi("book") }} />

      <article className="bg-[var(--color-page)] pb-[clamp(4rem,10svh,7rem)]">
        <header className="mx-auto flex max-w-4xl flex-col items-center px-6 pt-[clamp(4rem,10svh,7rem)] text-center">
          <p className="lunia-animate-fade-up text-[0.8rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-teal-ink)]">
            {tIndex("category")}
            {dateLabel && <span className="text-[var(--color-ink)]/45"> · {dateLabel}</span>}
          </p>
          <h1 className="lx-display lunia-animate-fade-up lunia-delay-1 mt-5 text-[clamp(2.6rem,1.5rem+4vw,5.25rem)] text-[var(--color-ink)]">{title}</h1>
          <p className="lx-lead lunia-animate-fade-up lunia-delay-2 mt-6 max-w-2xl">{localized(locale, post.excerptEn, post.excerptAr)}</p>
          {post.authorName && (
            <p className="lunia-animate-fade-up lunia-delay-3 mt-6 text-[0.9rem] text-[var(--color-ink)]/55">
              {tPost("byLabel")} {post.authorName}
            </p>
          )}
        </header>

        <div className="mx-auto mt-[clamp(3rem,7svh,4.5rem)] w-full max-w-6xl px-4 sm:px-6">
          <div data-grow className="relative aspect-[16/10] overflow-hidden rounded-[28px] bg-[var(--color-ice)] sm:aspect-[16/8]">
            <SmartMedia media={heroMedia} alt={title} />
          </div>
        </div>

        <div className="mx-auto mt-[clamp(3rem,8svh,5rem)] flex max-w-[42rem] flex-col gap-7 px-6 text-start">
          {paragraphs.map((paragraph, index) => (
            <p
              key={index}
              className={
                index === 0
                  ? "lx-display text-[clamp(1.5rem,1.2rem+0.9vw,1.95rem)] leading-[1.4] text-[var(--color-ink)]"
                  : "text-[1.15rem] leading-[1.8] text-[var(--color-ink)]/80"
              }
            >
              {paragraph}
            </p>
          ))}
        </div>
      </article>

      {more.length > 0 && (
        <section className="bg-[#e8f1ee] py-[clamp(5rem,12svh,8rem)]">
          <div className="mx-auto w-full max-w-7xl px-5 sm:px-6">
            <h2 className="lx-display mb-8 text-[clamp(1.9rem,1.4rem+1.4vw,2.6rem)] text-[var(--color-ink)]">{tPost("moreHeading")}</h2>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {more.map(({ p, i }, k) => {
                const cms = moreCms[k];
                return (
                  <NewsTile
                    key={p.id}
                    href={`/${locale}/journal/${p.slug}`}
                    media={cms ? { type: "cms", key: cms.key, kind: cms.kind } : journalStill(p.slug, i)}
                    category={tIndex("category")}
                    title={localized(locale, p.titleEn, p.titleAr)}
                    excerpt={localized(locale, p.excerptEn, p.excerptAr)}
                    date={formatDate(locale, p.publishedAt) ?? undefined}
                  />
                );
              })}
            </div>
          </div>
        </section>
      )}

      <Section tone="plain">
        <CtaBand
          eyebrow={tPost("cta.eyebrow")}
          headline={tPost("cta.headline")}
          ctaLabel={tCommon("bookNow")}
          ctaHref={bookHref}
        />
      </Section>
    </main>
  );
}
