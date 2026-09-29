import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Chevron } from "@/components/site/home/AppleHero";

// The public 404, in the brand: a quiet page-tone opener with the glow mark,
// a display headline and the three ways forward (home, book, services). Uses
// the request locale so /ar/... and /en/... each get their own copy.
export default async function NotFound() {
  const locale = await getLocale();
  const [t, tNav] = await Promise.all([
    getTranslations({ locale, namespace: "notFound" }),
    getTranslations({ locale, namespace: "nav" }),
  ]);
  const home = `/${locale}`;

  return (
    <main className="flex flex-col">
      <section className="lunia-pattern-waves bg-[var(--color-page)] py-[clamp(6rem,18svh,12rem)]" data-testid="not-found">
        <div className="mx-auto flex max-w-3xl flex-col items-center px-6 text-center">
          <span className="lx-eyebrow lunia-animate-fade-up">
            <span aria-hidden="true" className="lunia-glow-mark" />
            {t("eyebrow")}
          </span>
          <p aria-hidden="true" className="lx-display lunia-animate-fade-up lunia-delay-1 mt-6 text-[clamp(5rem,4rem+8vw,11rem)] leading-none text-[var(--color-teal)]">
            404
          </p>
          <h1 className="lx-display lx-h2 lunia-animate-fade-up lunia-delay-2 mt-4 text-[var(--color-ink)]">{t("heading")}</h1>
          <p className="lx-lead lunia-animate-fade-up lunia-delay-3 mt-6 max-w-xl">{t("body")}</p>
          <div className="lunia-animate-fade-up lunia-delay-4 mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
            <Link href={`${home}/book`} className="lx-pill">
              {t("book")}
            </Link>
            <Link href={home} className="lx-pill lx-pill-ghost">
              {t("home")}
            </Link>
            <Link href={`${home}/services`} className="lx-link">
              {t("services")}
              <Chevron />
            </Link>
          </div>
          <nav aria-label={tNav("primaryLabel")} className="lunia-animate-fade-up lunia-delay-5 mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
            {(["about", "services", "brands", "results", "journal", "contact"] as const).map((key) => (
              <Link key={key} href={`${home}/${key}`} className="rounded-sm text-[var(--color-ink)]/75 transition-colors duration-200 hover:text-[var(--color-ink)]">
                {tNav(key)}
              </Link>
            ))}
          </nav>
        </div>
      </section>
    </main>
  );
}
