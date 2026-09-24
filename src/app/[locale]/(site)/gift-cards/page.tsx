import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LocalNav } from "@/components/site/apple/LocalNav";
import { Chapter } from "@/components/site/apple/Chapter";
import { FeatureTiles } from "@/components/site/apple/FeatureTiles";
import type { IconName } from "@/components/site/apple/Icon";
import { GiftCardFan } from "@/components/site/apple/GiftCardFan";
import { buildMetadata } from "@/modules/seo/metadata";
import type { PublicLocale } from "@/modules/cms/publicContent";
import { GiftCardForm } from "./GiftCardForm";

interface GiftCardsPageProps {
  params: Promise<{ locale: string }>;
}

function isPublicLocale(locale: string): locale is PublicLocale {
  return locale === "ar" || locale === "en";
}

export async function generateMetadata({ params }: GiftCardsPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  const [tEn, tAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "giftCards.meta" }),
    getTranslations({ locale: "ar", namespace: "giftCards.meta" }),
  ]);
  return buildMetadata({
    locale,
    path: "/gift-cards",
    titleEn: tEn("title"),
    titleAr: tAr("title"),
    descEn: tEn("description"),
    descAr: tAr("description"),
  });
}

const HOW_ICONS: IconName[] = ["gift", "mail", "sparkle"];

export default async function GiftCardsPage({ params }: GiftCardsPageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";
  const t = await getTranslations({ locale, namespace: "giftCards" });
  const howTiles = (t.raw("how.tiles") as { title: string; body: string }[]).map((tile, i) => ({
    icon: HOW_ICONS[i % HOW_ICONS.length],
    title: tile.title,
    body: tile.body,
  }));

  return (
    <main className="flex flex-col">
      <LocalNav
        title={t("hero.eyebrow")}
        links={[
          { href: "#how", label: t("localNav.how") },
          { href: "#buy", label: t("localNav.buy") },
        ]}
        cta={{ href: "#buy", label: t("localNav.buy") }}
      />

      <section className="overflow-hidden bg-[var(--color-page)] pb-[clamp(4rem,10svh,7rem)] pt-[clamp(4.5rem,11svh,8rem)]">
        <div className="mx-auto flex max-w-5xl flex-col items-center px-6 text-center">
          <span className="lx-eyebrow lunia-animate-fade-up">
            <span aria-hidden="true" className="lunia-glow-mark" />
            {t("hero.eyebrow")}
          </span>
          <h1 className="lx-display lx-h1 lunia-animate-fade-up lunia-delay-1 mt-5 text-[var(--color-ink)]">{t("hero.heading")}</h1>
          <p className="lx-lead lunia-animate-fade-up lunia-delay-2 mt-6 max-w-2xl">{t("hero.intro")}</p>
          <a href="#buy" className="lx-pill lunia-animate-fade-up lunia-delay-3 mt-8">
            {t("heroCta")}
          </a>
        </div>
        <div className="mt-[clamp(3rem,8svh,5rem)] px-4">
          <GiftCardFan label={t("cardLabel")} />
        </div>
      </section>

      <Chapter id="how" tone="mist" eyebrow={t("how.eyebrow")} heading={t("how.heading")}>
        <FeatureTiles tiles={howTiles} columns={3} surface="white" />
      </Chapter>

      <div className="bg-[var(--color-page)] px-4 pt-[clamp(4rem,10svh,7rem)] sm:px-6">
        <div data-grow className="relative mx-auto aspect-[4/5] max-w-7xl overflow-hidden rounded-[28px] bg-[var(--color-ice)] sm:aspect-[21/9]">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand media */}
          <img src="/media/relax.webp" alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </div>
      </div>

      <Chapter id="buy" tone="page" eyebrow={t("buy.eyebrow")} heading={t("buy.heading")}>
        <div className="mx-auto max-w-3xl">
          <GiftCardForm locale={locale} />
        </div>
      </Chapter>
    </main>
  );
}
