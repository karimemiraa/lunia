import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createMedia, deleteMedia } from "@/modules/cms/media";
import { upsertPageContent, type PageContentData } from "@/modules/cms/pageContent";
import { getSetting, setSetting, type HeroSettings } from "@/modules/cms/settings";
import { getHomeHero } from "@/modules/cms/publicContent";

// getHomeHero hardcodes the pageKey "home" and the setting key "hero", so
// these tests snapshot and restore both rows around each case rather than
// using disposable keys (as other CMS tests do) — this is real content the
// public home page reads, including in e2e.
async function withHomeAndHeroSetting(
  content: PageContentData,
  heroSetting: HeroSettings | null,
  run: () => Promise<void>,
): Promise<void> {
  const originalHome = await prisma.pageContent.findUnique({ where: { pageKey: "home" } });
  const originalHeroSetting = await getSetting("hero");

  try {
    await upsertPageContent("home", content);
    if (heroSetting) {
      await setSetting("hero", heroSetting);
    } else {
      await prisma.siteSetting.deleteMany({ where: { key: "hero" } });
    }

    await run();
  } finally {
    if (originalHome) {
      await prisma.pageContent.update({ where: { pageKey: "home" }, data: { data: originalHome.data as object } });
    } else {
      await prisma.pageContent.deleteMany({ where: { pageKey: "home" } });
    }

    if (originalHeroSetting) {
      await setSetting("hero", originalHeroSetting);
    } else {
      await prisma.siteSetting.deleteMany({ where: { key: "hero" } });
    }
  }
}

describe("getHomeHero heroMedia", () => {
  it("returns {key, kind} from the PageContent hero section's heroMediaId", async () => {
    const media = await createMedia({
      kind: "IMAGE",
      storageKey: `test/hero-${Date.now()}-${Math.random().toString(36).slice(2)}.png`,
      filename: "hero.png",
      mimeType: "image/png",
      sizeBytes: 10,
    });

    try {
      const content: PageContentData = {
        sections: [
          {
            key: "hero",
            type: "hero",
            heroMediaId: media.id,
            fields: {
              headline: { en: "Headline", ar: "عنوان" },
              cta: { en: "Book", ar: "احجز" },
              intro: { en: "Intro", ar: "مقدمة" },
            },
          },
        ],
      };

      await withHomeAndHeroSetting(content, null, async () => {
        const hero = await getHomeHero("en");
        expect(hero.heroMedia).toEqual({ key: media.storageKey, kind: "IMAGE" });
      });
    } finally {
      await deleteMedia(media.id);
    }
  });

  it("returns {key, kind: VIDEO} for a video hero media asset", async () => {
    const media = await createMedia({
      kind: "VIDEO",
      storageKey: `test/hero-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`,
      filename: "hero.mp4",
      mimeType: "video/mp4",
      sizeBytes: 10,
    });

    try {
      const content: PageContentData = {
        sections: [
          {
            key: "hero",
            type: "hero",
            heroMediaId: media.id,
            fields: {
              headline: { en: "Headline", ar: "عنوان" },
              cta: { en: "Book", ar: "احجز" },
              intro: { en: "Intro", ar: "مقدمة" },
            },
          },
        ],
      };

      await withHomeAndHeroSetting(content, null, async () => {
        const hero = await getHomeHero("en");
        expect(hero.heroMedia).toEqual({ key: media.storageKey, kind: "VIDEO" });
      });
    } finally {
      await deleteMedia(media.id);
    }
  });

  it("returns null when no hero media is set anywhere", async () => {
    const content: PageContentData = {
      sections: [
        {
          key: "hero",
          type: "hero",
          heroMediaId: null,
          fields: {
            headline: { en: "Headline", ar: "عنوان" },
            cta: { en: "Book", ar: "احجز" },
            intro: { en: "Intro", ar: "مقدمة" },
          },
        },
      ],
    };

    await withHomeAndHeroSetting(content, null, async () => {
      const hero = await getHomeHero("en");
      expect(hero.heroMedia).toBeNull();
    });
  });
});
