import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { getHomeHero, type PublicLocale } from "@/modules/cms/publicContent";

interface HomePageProps {
  params: Promise<{ locale: string }>;
}

function isPublicLocale(locale: string): locale is PublicLocale {
  return locale === "ar" || locale === "en";
}

export default async function Home({ params }: HomePageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "en";

  const hero = await getHomeHero(locale);

  return (
    <main>
      <Container>
        {hero.heroMedia && hero.heroMedia.kind === "IMAGE" && (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded assets, no static domain to configure for next/image
          <img
            src={`/api/media/${hero.heroMedia.key}`}
            alt={hero.headline}
            className="mt-8 h-64 w-full rounded object-cover"
          />
        )}
        {hero.heroMedia && hero.heroMedia.kind === "VIDEO" && (
          <video
            src={`/api/media/${hero.heroMedia.key}`}
            className="mt-8 h-64 w-full rounded object-cover"
            muted
            loop
            autoPlay
            playsInline
          />
        )}
        <h1 className="font-[family-name:var(--font-display)] text-5xl mt-24">{hero.headline}</h1>
        {hero.intro && <p className="mt-4 max-w-xl text-[var(--color-ink)]/80">{hero.intro}</p>}
        <div className="mt-8">
          <Button>{hero.cta}</Button>
        </div>
      </Container>
    </main>
  );
}
