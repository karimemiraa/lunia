import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Department } from "@prisma/client";

import { Icon, type IconName } from "@/components/site/apple/Icon";
import { SmartMedia } from "@/components/site/apple/SmartMedia";
import { Chevron } from "@/components/site/home/AppleHero";
import { CtaBand } from "@/components/site/CtaBand";

import { getHomeHero, type PublicLocale } from "@/modules/cms/publicContent";
import { getSetting } from "@/modules/cms/settings";
import { listDepartments } from "@/modules/catalog/departments";
import { localized } from "@/modules/catalog/localize";
import { departmentStill, serviceStill } from "@/lib/siteMedia";
import { getAggregate } from "@/modules/reviews/reviews";

interface StepMessage {
  title: string;
  body?: string;
}

interface SereneHomeProps {
  locale: PublicLocale;
}

// The Soft-UI, booking-first homepage body — shared by the /v2 preview and the
// edition switcher.
export async function SereneHome({ locale }: SereneHomeProps) {
  const isAr = locale === "ar";

  const [hero, departments, aggregate, tCommon, tHero, tJourney, tServices, tValues, tCta] = await Promise.all([
    getHomeHero(locale),
    listDepartments({ publishedOnly: true }),
    getAggregate({}),
    getTranslations({ locale, namespace: "common" }),
    getTranslations({ locale, namespace: "home.hero" }),
    getTranslations({ locale, namespace: "home.journey" }),
    getTranslations({ locale, namespace: "home.services" }),
    getTranslations({ locale, namespace: "home.values" }),
    getTranslations({ locale, namespace: "home.cta" }),
  ]);

  const bookHref = `/${locale}/book`;
  const steps = (tJourney.raw("steps") as StepMessage[]).slice(0, 3);
  const stepIcons: IconName[] = ["diagnose", "sparkle", "leaf"];
  const trust: { icon: IconName; label: string }[] = [
    { icon: "diagnose", label: isAr ? "تشخيص أولاً" : "Consultation-first" },
    { icon: "shield", label: isAr ? "علامات طبية" : "Medical-grade" },
    { icon: "pin", label: isAr ? "الرياض" : "Riyadh" },
  ];
  const values = [
    { icon: "drop" as IconName, title: tValues("purity.title"), body: tValues("purity.body") },
    { icon: "sparkle" as IconName, title: tValues("mastery.title"), body: tValues("mastery.body") },
    { icon: "leaf" as IconName, title: tValues("revelation.title"), body: tValues("revelation.body") },
  ];
  const heroMedia = departments[0] ? departmentStill(departments[0].slug) : serviceStill("signature-facials-hydrafacial", "skin");
  const rating = aggregate.count > 0 ? aggregate : null;

  return (
    <main className="flex flex-col bg-[var(--color-page)]">
      {/* 1 — Hero: value + an obvious primary action, calm and uncluttered. */}
      <section className="mx-auto grid w-full max-w-7xl items-center gap-10 px-5 pb-[clamp(3rem,7svh,5rem)] pt-[clamp(7rem,14svh,10rem)] sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div data-reveal className="flex flex-col items-start">
          <span className="srn-chip">
            <span aria-hidden="true" className="lunia-glow-mark" />
            {tHero("eyebrow")}
          </span>
          <h1 data-splittext className="lx-display mt-6 text-[clamp(2.6rem,1.6rem+3.4vw,4.6rem)] leading-[1.04] text-[var(--color-ink)]">
            {hero.headline}
          </h1>
          <p className="lx-lead mt-6 max-w-xl">{hero.intro || tHero("subhead")}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={bookHref} data-magnetic className="lx-pill px-7 py-3.5 text-[0.95rem]">
              {tCommon("bookNow")}
            </Link>
            <a href="#treat" className="lx-pill lx-pill-ghost px-6 py-3.5 text-[0.95rem]">
              {tServices("explore")}
              <Chevron />
            </a>
          </div>

          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3">
            {trust.map((t) => (
              <li key={t.label} className="flex items-center gap-2 text-[0.9rem] text-[var(--color-ink)]/70">
                <span className="text-[var(--color-teal-ink)]"><Icon name={t.icon} className="h-4 w-4" /></span>
                {t.label}
              </li>
            ))}
          </ul>
        </div>

        {/* Media card with a floating rating + reassurance caption. */}
        <div className="relative">
          <div className="srn-card srn-lift srn-float relative aspect-[4/5] overflow-hidden sm:aspect-[5/4] lg:aspect-[4/5]">
            <SmartMedia media={heroMedia} alt={hero.headline} />
          </div>
          {rating && (
            <div className="srn-card absolute -bottom-5 start-5 flex items-center gap-3 px-4 py-3">
              <span className="flex items-center gap-0.5 text-[var(--color-gold-ink)]" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Icon key={i} name="sparkle" className="h-3.5 w-3.5" />
                ))}
              </span>
              <span className="text-sm text-[var(--color-ink)]">
                <span className="font-semibold">{rating.avg.toFixed(1)}</span>
                <span className="text-[var(--color-ink)]/55"> · {rating.count}</span>
              </span>
            </div>
          )}
        </div>
      </section>

      {/* 2 — Three guided steps (the funnel, made calm and legible). */}
      <section className="mx-auto w-full max-w-7xl px-5 py-[clamp(3.5rem,9svh,6rem)] sm:px-6">
        <header className="mx-auto max-w-2xl text-center">
          <span className="srn-chip mx-auto"><span aria-hidden="true" className="lunia-glow-mark" />{tJourney("eyebrow")}</span>
          <h2 data-splittext className="lx-display lx-h2 mt-5 text-[var(--color-ink)]">{tJourney("heading")}</h2>
        </header>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} data-reveal className="srn-card srn-lift flex flex-col p-7">
              <div className="flex items-center justify-between">
                <span className="srn-icon"><Icon name={stepIcons[i]} /></span>
                <span className="srn-num">{i + 1}</span>
              </div>
              <h3 className="lx-display mt-6 text-[1.6rem] leading-tight text-[var(--color-ink)]">{step.title}</h3>
              {step.body && <p className="mt-3 text-[0.98rem] leading-relaxed text-[var(--color-ink)]/70">{step.body}</p>}
            </li>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <Link href={bookHref} className="lx-link text-[0.95rem]">
            {tCommon("bookNow")}
            <Chevron />
          </Link>
        </div>
      </section>

      {/* 3 — What we treat: clear department cards, each a path to booking. */}
      <section id="treat" className="scroll-mt-24 bg-[var(--color-mist)] py-[clamp(3.5rem,9svh,6rem)]">
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-6">
          <header className="max-w-2xl">
            <span className="srn-chip"><span aria-hidden="true" className="lunia-glow-mark" />{tServices("eyebrow")}</span>
            <h2 data-splittext className="lx-display lx-h2 mt-5 text-[var(--color-ink)]">{tServices("heading")}</h2>
            <p className="lx-lead mt-5">{tServices("intro")}</p>
          </header>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {departments.map((d: Department) => {
              const name = localized(locale, d.nameEn, d.nameAr);
              const tagline = localized(locale, d.taglineEn, d.taglineAr);
              return (
                <article key={d.id} data-reveal className="srn-card srn-lift group flex flex-col overflow-hidden">
                  <div className="relative aspect-[16/10] overflow-hidden [&_img]:transition-transform [&_img]:duration-[1.2s] group-hover:[&_img]:scale-105">
                    <SmartMedia media={departmentStill(d.slug)} alt={name} />
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="lx-display text-[1.55rem] leading-tight text-[var(--color-ink)]">{name}</h3>
                    <p className="mt-2 line-clamp-2 text-[0.95rem] leading-relaxed text-[var(--color-ink)]/65">{tagline}</p>
                    <div className="mt-auto flex items-center gap-x-5 pt-5">
                      <Link href={`/${locale}/services/${d.slug}`} className="lx-link text-[0.9rem]">
                        {tServices("explore")}
                        <Chevron />
                      </Link>
                      <Link href={`${bookHref}?dept=${d.slug}`} className="lx-pill px-4 py-1.5 text-[0.8rem]">
                        {tCommon("bookNow")}
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4 — Why Lunia: soft benefit tiles + the proof numbers. */}
      <section className="mx-auto w-full max-w-7xl px-5 py-[clamp(3.5rem,9svh,6rem)] sm:px-6">
        <header className="mx-auto max-w-2xl text-center">
          <span className="srn-chip mx-auto"><span aria-hidden="true" className="lunia-glow-mark" />{tValues("eyebrow")}</span>
          <h2 data-splittext className="lx-display lx-h2 mt-5 text-[var(--color-ink)]">{tValues("heading")}</h2>
          <p className="lx-lead mx-auto mt-5">{tValues("intro")}</p>
        </header>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {values.map((v) => (
            <div key={v.title} data-reveal className="srn-card flex flex-col p-7">
              <span className="srn-icon"><Icon name={v.icon} /></span>
              <h3 className="lx-display mt-5 text-[1.5rem] text-[var(--color-ink)]">{v.title}</h3>
              <p className="mt-3 text-[0.98rem] leading-relaxed text-[var(--color-ink)]/70">{v.body}</p>
            </div>
          ))}
        </div>
        <dl className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-4">
          {[
            { v: String(departments.length), l: tValues("stats.departments") },
            { v: "6", l: tValues("stats.steps") },
            { v: rating ? rating.avg.toFixed(1) : "5.0", l: isAr ? "تقييم العميلات" : "Client rating" },
            { v: "100%", l: tValues("stats.diagnostic") },
          ].map((s) => (
            <div key={s.l} className="srn-card flex flex-col items-center px-4 py-7 text-center">
              <span data-reveal className="lx-display text-[clamp(2.2rem,1.6rem+1.6vw,3.2rem)] leading-none text-[var(--color-teal-ink)]">{s.v}</span>
              <span className="mt-3 text-[0.85rem] leading-snug text-[var(--color-ink)]/60">{s.l}</span>
            </div>
          ))}
        </dl>
      </section>

      {/* 5 — The booking band. */}
      <section className="px-4 pb-[clamp(3.5rem,9svh,6rem)] sm:px-6">
        <div className="mx-auto max-w-7xl">
          <CtaBand eyebrow={tCta("eyebrow")} headline={tCta("headline")} ctaLabel={tCommon("bookNow")} ctaHref={bookHref} />
        </div>
      </section>
    </main>
  );
}
