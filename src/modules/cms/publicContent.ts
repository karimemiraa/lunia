import { getPageContent } from "./pageContent";
import { getSetting } from "./settings";
import { getMedia } from "./media";

export type PublicLocale = "ar" | "en";

export interface HomeHero {
  headline: string;
  cta: string;
  intro: string;
  heroMediaKey: string | null;
}

// Last-resort constants so the home page never renders blank copy, even on
// a brand-new environment with no PageContent row and no hero SiteSetting.
const FALLBACK_HERO: Record<PublicLocale, { headline: string; cta: string; intro: string }> = {
  en: { headline: "Where natural beauty begins", cta: "Book Now", intro: "" },
  ar: { headline: "حيث يبدأ الجمال الطبيعي", cta: "احجزي الآن", intro: "" },
};

function pick(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// Reads the editable home hero for the public site, by locale. Resolution
// order per field:
//   1. PageContent("home") section "hero" -> fields.<field>[locale]
//   2. SiteSetting("hero") -> <field><Locale> (e.g. headlineEn/headlineAr)
//   3. Hardcoded fallback constant (never throws, never renders blank)
//
// heroMediaKey resolves the hero's media storage key (for `/api/media/<key>`)
// from PageContent's heroMediaId, falling back to the hero setting's
// mediaId. Returns null if neither is set or the referenced media is gone.
export async function getHomeHero(locale: PublicLocale): Promise<HomeHero> {
  const [content, heroSetting] = await Promise.all([
    getPageContent("home").catch(() => null),
    getSetting("hero").catch(() => null),
  ]);

  const heroSection = content?.sections.find((section) => section.key === "hero");
  const fields = heroSection?.fields;

  const headline =
    pick(fields?.headline?.[locale]) ??
    pick(locale === "en" ? heroSetting?.headlineEn : heroSetting?.headlineAr) ??
    FALLBACK_HERO[locale].headline;

  const cta =
    pick(fields?.cta?.[locale]) ??
    pick(locale === "en" ? heroSetting?.ctaEn : heroSetting?.ctaAr) ??
    FALLBACK_HERO[locale].cta;

  const intro = pick(fields?.intro?.[locale]) ?? FALLBACK_HERO[locale].intro;

  const heroMediaId = heroSection?.heroMediaId ?? heroSetting?.mediaId ?? null;
  let heroMediaKey: string | null = null;
  if (heroMediaId) {
    const media = await getMedia(heroMediaId).catch(() => null);
    heroMediaKey = media?.storageKey ?? null;
  }

  return { headline, cta, intro, heroMediaKey };
}
