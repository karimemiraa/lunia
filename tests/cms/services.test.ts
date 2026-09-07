import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";
import { createMedia, listMedia, getMedia, updateMediaAlt, deleteMedia } from "@/modules/cms/media";
import { pageContentSchema, getPageContent, upsertPageContent, type PageContentData } from "@/modules/cms/pageContent";

describe("media service", () => {
  it("creates, lists, updates alt text, and deletes a media asset (including its storage object)", async () => {
    const storageKey = `test/media-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
    await storage.put(storageKey, Buffer.from("fake image bytes"), "image/jpeg");

    const media = await createMedia({
      kind: "IMAGE",
      storageKey,
      filename: "test.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 17,
      width: 100,
      height: 100,
      altEn: "before",
      altAr: "قبل",
    });

    try {
      expect(media.id).toBeTruthy();
      expect(media.storageKey).toBe(storageKey);
      expect(media.altEn).toBe("before");

      const fetched = await getMedia(media.id);
      expect(fetched?.id).toBe(media.id);

      const all = await listMedia();
      expect(all.some((m) => m.id === media.id)).toBe(true);

      // listMedia orders by createdAt desc, id desc (a deterministic
      // tiebreak for rows created in the same millisecond, e.g. under
      // concurrent test runs). Rather than assert our row lands at a
      // specific index — which would be flaky if other tests insert media
      // concurrently — verify the whole list actually respects that order.
      for (let i = 1; i < all.length; i++) {
        const prev = all[i - 1];
        const curr = all[i];
        if (prev.createdAt.getTime() !== curr.createdAt.getTime()) {
          expect(prev.createdAt.getTime()).toBeGreaterThan(curr.createdAt.getTime());
        } else {
          expect(prev.id >= curr.id).toBe(true);
        }
      }

      const updated = await updateMediaAlt(media.id, { altEn: "after", altAr: "بعد" });
      expect(updated.altEn).toBe("after");
      expect(updated.altAr).toBe("بعد");

      await deleteMedia(media.id);

      expect(await getMedia(media.id)).toBeNull();
      expect(await storage.get(storageKey)).toBeNull();
    } finally {
      // Cleanup in case assertions failed before deleteMedia ran.
      await prisma.mediaAsset.deleteMany({ where: { storageKey } });
      await storage.delete(storageKey);
    }
  });

  it("returns null from getMedia for a missing id", async () => {
    expect(await getMedia("does-not-exist")).toBeNull();
  });
});

describe("pageContentSchema", () => {
  it("accepts a valid page content object", () => {
    const valid: PageContentData = {
      sections: [
        {
          key: "hero",
          type: "hero",
          heroMediaId: "media-1",
          fields: {
            title: { en: "Welcome", ar: "أهلا" },
          },
        },
      ],
    };
    expect(pageContentSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a section missing fields", () => {
    const invalid = {
      sections: [{ key: "hero", type: "hero" }],
    };
    expect(pageContentSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects a field missing the ar value", () => {
    const invalid = {
      sections: [
        {
          key: "hero",
          type: "hero",
          fields: { title: { en: "Welcome" } },
        },
      ],
    };
    expect(pageContentSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("pageContent service", () => {
  it("round-trips a valid object through upsert and get", async () => {
    const pageKey = `test-page-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const content: PageContentData = {
      sections: [
        {
          key: "hero",
          type: "hero",
          heroMediaId: null,
          fields: {
            title: { en: "Welcome", ar: "أهلا" },
          },
        },
      ],
    };

    try {
      await upsertPageContent(pageKey, content);
      const fetched = await getPageContent(pageKey);
      expect(fetched).toEqual(content);

      // upsert again to confirm update path works, not just insert
      const updated: PageContentData = {
        sections: [
          {
            key: "hero",
            type: "hero",
            fields: { title: { en: "Welcome back", ar: "أهلا بعودتك" } },
          },
        ],
      };
      await upsertPageContent(pageKey, updated);
      const refetched = await getPageContent(pageKey);
      expect(refetched?.sections[0].fields.title.en).toBe("Welcome back");
    } finally {
      await prisma.pageContent.deleteMany({ where: { pageKey } });
    }
  });

  it("returns null for a page key that has no row", async () => {
    expect(await getPageContent(`missing-page-${Date.now()}`)).toBeNull();
  });

  it("throws when upserting an invalid object", async () => {
    const pageKey = `test-invalid-${Date.now()}`;
    const invalid = { sections: [{ key: "hero", type: "hero" }] } as unknown as PageContentData;
    await expect(upsertPageContent(pageKey, invalid)).rejects.toThrow();
    expect(await getPageContent(pageKey)).toBeNull();
  });
});
