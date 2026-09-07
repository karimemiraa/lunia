import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";

describe("cms models", () => {
  it("round-trips a MediaAsset and a PageContent", async () => {
    const storageKey = `media/test-${Date.now()}.jpg`;
    const pageKey = `test-page-${Date.now()}`;

    const media = await prisma.mediaAsset.create({
      data: {
        kind: "IMAGE",
        storageKey,
        filename: "test.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 12345,
        width: 800,
        height: 600,
        altEn: "A test image",
        altAr: "صورة اختبار",
      },
    });

    const page = await prisma.pageContent.create({
      data: {
        pageKey,
        data: {
          sections: [{ type: "hero", titleEn: "Welcome", titleAr: "أهلا", mediaId: media.id }],
        },
      },
    });

    try {
      const fetchedMedia = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: media.id } });
      expect(fetchedMedia.kind).toBe("IMAGE");
      expect(fetchedMedia.storageKey).toBe(storageKey);
      expect(fetchedMedia.filename).toBe("test.jpg");
      expect(fetchedMedia.mimeType).toBe("image/jpeg");
      expect(fetchedMedia.sizeBytes).toBe(12345);
      expect(fetchedMedia.width).toBe(800);
      expect(fetchedMedia.height).toBe(600);
      expect(fetchedMedia.altEn).toBe("A test image");
      expect(fetchedMedia.altAr).toBe("صورة اختبار");
      expect(fetchedMedia.focalX).toBe(0.5);
      expect(fetchedMedia.focalY).toBe(0.5);
      expect(fetchedMedia.uploadedById).toBeNull();
      expect(fetchedMedia.createdAt).toBeInstanceOf(Date);

      const fetchedPage = await prisma.pageContent.findUniqueOrThrow({ where: { id: page.id } });
      expect(fetchedPage.pageKey).toBe(pageKey);
      expect(fetchedPage.data).toEqual({
        sections: [{ type: "hero", titleEn: "Welcome", titleAr: "أهلا", mediaId: media.id }],
      });
      expect(fetchedPage.updatedAt).toBeInstanceOf(Date);
    } finally {
      await prisma.pageContent.delete({ where: { id: page.id } });
      await prisma.mediaAsset.delete({ where: { id: media.id } });
    }
  });
});
