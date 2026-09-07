import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/site/Section";
import { CtaBand } from "@/components/site/CtaBand";
import { MediaFrame } from "@/components/site/MediaFrame";
import { Prose } from "@/components/site/Prose";
import { JsonLd } from "@/components/seo/JsonLd";

import type { PublicLocale } from "@/modules/cms/publicContent";
import { getMedia } from "@/modules/cms/media";
import { getEnv } from "@/lib/env";
import { routing } from "@/i18n/routing";
import { listPublishedPosts, getPostBySlug } from "@/modules/catalog/journal";
import { localized } from "@/modules/catalog/localize";
import { buildMetadata } from "@/modules/seo/metadata";
import { breadcrumbJsonLd, articleJsonLd } from "@/modules/seo/jsonld";

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

// Pre-renders every published post for both locales at build time.
export async function generateStaticParams() {
  const posts = await listPublishedPosts();
  return routing.locales.flatMap((locale) => posts.map((post) => ({ locale, slug: post.slug })));
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

  const [tCommon, tNav, tPost] = await Promise.all([
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "nav" }),
    getTranslations({ locale, namespace: "journalPost" }),
  ]);

  const contactHref = `/${locale}/contact`;
  const appUrl = resolveAppUrl();
  const postUrl = `${appUrl}/${locale}/journal/${post.slug}`;

  const heroMedia = await resolveMedia(post.heroMediaId);

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

      <Section tone="plain">
        <div className="mx-auto flex max-w-2xl flex-col gap-8 text-start">
          <div className="flex flex-col gap-4">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-canopy)]">
              {tNav("journal")}
            </span>
            <h1 className="font-[family-name:var(--font-display)] text-4xl leading-[1.1] tracking-tight text-[var(--color-ink)] sm:text-5xl">
              {title}
            </h1>
            <p className="text-sm text-[var(--color-ink)]/55">
              {post.authorName && `${tPost("byLabel")} ${post.authorName}`}
              {post.authorName && dateLabel && " · "}
              {dateLabel}
            </p>
          </div>

          <MediaFrame
            mediaKey={heroMedia?.key}
            kind={heroMedia?.kind}
            alt={title}
            aspectClassName="aspect-[16/9]"
          />

          <Prose>
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </Prose>
        </div>
      </Section>

      <Section tone="tinted">
        <CtaBand
          eyebrow={tPost("cta.eyebrow")}
          headline={tPost("cta.headline")}
          ctaLabel={tCommon("bookNow")}
          ctaHref={contactHref}
        />
      </Section>
    </main>
  );
}
