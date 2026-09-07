import { describe, it, expect } from "vitest";
import { listDepartments, getDepartmentBySlug } from "@/modules/catalog/departments";
import { listServices, getServiceBySlug } from "@/modules/catalog/services";
import { listBrands, getBrandBySlug } from "@/modules/catalog/brands";
import { listPublishedPosts, getPostBySlug } from "@/modules/catalog/journal";
import { localized, localizedList } from "@/modules/catalog/localize";
import { createInquiry, listInquiries } from "@/modules/catalog/inquiries";
import { prisma } from "@/lib/db";

describe("departments", () => {
  it("listDepartments returns at least 3, ordered by `order`", async () => {
    const departments = await listDepartments();
    expect(departments.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < departments.length; i++) {
      expect(departments[i - 1].order).toBeLessThanOrEqual(departments[i].order);
    }
  });

  it("getDepartmentBySlug('skin') includes 4 ordered services", async () => {
    const skin = await getDepartmentBySlug("skin");
    expect(skin).not.toBeNull();
    expect(skin?.services.length).toBe(4);
    for (let i = 1; i < (skin?.services.length ?? 0); i++) {
      expect(skin!.services[i - 1].order).toBeLessThanOrEqual(skin!.services[i].order);
    }
  });

  it("getDepartmentBySlug returns null for an unknown slug", async () => {
    expect(await getDepartmentBySlug("does-not-exist")).toBeNull();
  });
});

describe("services", () => {
  it("listServices returns ordered services, optionally scoped to a department", async () => {
    const skin = await getDepartmentBySlug("skin");
    expect(skin).not.toBeNull();
    const services = await listServices(skin!.id);
    expect(services.length).toBe(4);
    for (let i = 1; i < services.length; i++) {
      expect(services[i - 1].order).toBeLessThanOrEqual(services[i].order);
    }
  });

  it("getServiceBySlug returns a service with its department", async () => {
    const service = await getServiceBySlug("diagnostic-skin-analysis");
    expect(service).not.toBeNull();
    expect(service?.department.slug).toBe("skin");
  });

  it("getServiceBySlug returns null for an unknown slug", async () => {
    expect(await getServiceBySlug("does-not-exist")).toBeNull();
  });
});

describe("brands", () => {
  it("listBrands returns at least 5, ordered", async () => {
    const brands = await listBrands();
    expect(brands.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < brands.length; i++) {
      expect(brands[i - 1].order).toBeLessThanOrEqual(brands[i].order);
    }
  });

  it("getBrandBySlug returns a brand by slug", async () => {
    const brand = await getBrandBySlug("zo-skin-health");
    expect(brand?.name).toBe("ZO Skin Health");
  });

  it("getBrandBySlug returns null for an unknown slug", async () => {
    expect(await getBrandBySlug("does-not-exist")).toBeNull();
  });
});

describe("journal", () => {
  it("listPublishedPosts returns only published posts, newest first", async () => {
    const posts = await listPublishedPosts();
    expect(posts.length).toBeGreaterThanOrEqual(2);
    expect(posts.every((p) => p.isPublished)).toBe(true);
    for (let i = 1; i < posts.length; i++) {
      const prev = posts[i - 1].publishedAt?.getTime() ?? 0;
      const curr = posts[i].publishedAt?.getTime() ?? 0;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it("does not return unpublished posts", async () => {
    const slug = `test-unpublished-${Date.now()}`;
    await prisma.blogPost.create({
      data: {
        slug,
        titleEn: "Draft",
        titleAr: "مسودة",
        excerptEn: "Draft excerpt",
        excerptAr: "مقتطف مسودة",
        bodyEn: "Draft body",
        bodyAr: "نص المسودة",
        isPublished: false,
      },
    });
    try {
      const posts = await listPublishedPosts();
      expect(posts.some((p) => p.slug === slug)).toBe(false);
    } finally {
      await prisma.blogPost.deleteMany({ where: { slug } });
    }
  });

  it("getPostBySlug returns a published post by slug", async () => {
    const post = await getPostBySlug("the-korean-philosophy-of-skin-quality");
    expect(post).not.toBeNull();
    expect(post?.titleEn).toBe("The Korean Philosophy of Skin Quality");
  });

  it("getPostBySlug returns null for an unknown slug", async () => {
    expect(await getPostBySlug("does-not-exist")).toBeNull();
  });
});

describe("localize", () => {
  it("localized returns en or ar based on locale", () => {
    expect(localized("en", "Hello", "مرحبا")).toBe("Hello");
    expect(localized("ar", "Hello", "مرحبا")).toBe("مرحبا");
  });

  it("localizedList picks the right benefits array per locale", () => {
    const benefitsEn = ["a", "b"];
    const benefitsAr = ["ا", "ب"];
    expect(localizedList("en", benefitsEn, benefitsAr)).toEqual(["a", "b"]);
    expect(localizedList("ar", benefitsEn, benefitsAr)).toEqual(["ا", "ب"]);
  });
});

describe("inquiries", () => {
  it("createInquiry validates and creates a row, listInquiries returns newest first", async () => {
    const inquiry = await createInquiry({
      name: "Test Caller",
      phone: "+9665XXXXXXXX",
      email: "caller@example.com",
      message: "Interested in a consultation.",
      locale: "en",
      sourcePage: "/en/contact",
    });
    try {
      expect(inquiry.id).toBeTruthy();
      expect(inquiry.name).toBe("Test Caller");
      expect(inquiry.handled).toBe(false);

      const all = await listInquiries();
      expect(all[0]?.id).toBe(inquiry.id);
    } finally {
      await prisma.contactInquiry.delete({ where: { id: inquiry.id } });
    }
  });

  it("throws on invalid input (empty name)", async () => {
    await expect(
      createInquiry({
        name: "",
        phone: "+9665XXXXXXXX",
        message: "Hello",
        locale: "en",
      }),
    ).rejects.toThrow();
  });

  it("throws on invalid input (bad locale)", async () => {
    await expect(
      createInquiry({
        name: "Test",
        phone: "+9665XXXXXXXX",
        message: "Hello",
        // @ts-expect-error testing invalid locale at runtime
        locale: "fr",
      }),
    ).rejects.toThrow();
  });
});
