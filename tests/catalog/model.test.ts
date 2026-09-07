import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";

describe("catalog models (post-seed)", () => {
  it("has 3 departments, and the skin department has 4 services", async () => {
    const departments = await prisma.department.findMany();
    expect(departments.length).toBe(3);

    const skin = await prisma.department.findUnique({
      where: { slug: "skin" },
      include: { services: true },
    });
    expect(skin).not.toBeNull();
    expect(skin?.services.length).toBe(4);
    expect(Array.isArray(skin?.services[0]?.benefitsEn)).toBe(true);
  });

  it("has a Brand seeded by slug", async () => {
    const brand = await prisma.brand.findUnique({ where: { slug: "zo-skin-health" } });
    expect(brand).not.toBeNull();
    expect(brand?.name).toBe("ZO Skin Health");
  });

  it("has at least one published BlogPost", async () => {
    const posts = await prisma.blogPost.findMany({ where: { isPublished: true } });
    expect(posts.length).toBeGreaterThanOrEqual(2);
    expect(posts[0]?.publishedAt).toBeInstanceOf(Date);
  });

  it("round-trips a ContactInquiry", async () => {
    const inquiry = await prisma.contactInquiry.create({
      data: {
        name: "Test User",
        phone: "+9665XXXXXXXX",
        email: "test@example.com",
        message: "I would like to book a consultation.",
        locale: "en",
        sourcePage: "/en/contact",
      },
    });

    try {
      const fetched = await prisma.contactInquiry.findUniqueOrThrow({ where: { id: inquiry.id } });
      expect(fetched.name).toBe("Test User");
      expect(fetched.handled).toBe(false);
      expect(fetched.createdAt).toBeInstanceOf(Date);
    } finally {
      await prisma.contactInquiry.delete({ where: { id: inquiry.id } });
    }
  });
});
