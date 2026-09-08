import { z } from "zod";
import type { BlogPost } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertValidSlug } from "./slug";

// Lists published blog posts, newest first (by publishedAt).
export async function listPublishedPosts(): Promise<BlogPost[]> {
  return prisma.blogPost.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: "desc" },
  });
}

// Lists all posts for the admin CMS (published or not), ordered like the
// other catalog admin lists (by `order`, then newest-created first).
export async function listPosts(opts?: { publishedOnly?: boolean }): Promise<BlogPost[]> {
  const publishedOnly = opts?.publishedOnly ?? false;
  return prisma.blogPost.findMany({
    where: publishedOnly ? { isPublished: true } : undefined,
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
  });
}

// Fetches a blog post by slug, or null if none matches. Does not filter by
// isPublished — callers that need public-only access should check
// `isPublished` on the result (mirrors getDepartmentBySlug/getServiceBySlug,
// which likewise return unpublished rows so preview/admin flows can use the
// same lookup).
export async function getPostBySlug(slug: string): Promise<BlogPost | null> {
  return prisma.blogPost.findUnique({ where: { slug } });
}

// Fetches a blog post by id, or null if none matches. Used by the admin
// edit surface.
export async function getPostById(id: string): Promise<BlogPost | null> {
  return prisma.blogPost.findUnique({ where: { id } });
}

const createPostSchema = z.object({
  slug: z.string().min(1),
  titleEn: z.string().min(1),
  titleAr: z.string().min(1),
  excerptEn: z.string().min(1),
  excerptAr: z.string().min(1),
  bodyEn: z.string().min(1),
  bodyAr: z.string().min(1),
  heroMediaId: z.string().nullable().optional(),
  authorName: z.string().nullable().optional(),
  order: z.number().optional(),
  isPublished: z.boolean().optional(),
  publishedAt: z.date().nullable().optional(),
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

const updatePostSchema = createPostSchema.omit({ slug: true }).partial();
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

// If publishing (isPublished true) with no explicit publishedAt given,
// stamps it with now — so the post immediately sorts correctly in
// listPublishedPosts. Unpublishing leaves any existing publishedAt alone.
function resolvePublishedAt(
  isPublished: boolean | undefined,
  publishedAt: Date | null | undefined,
  previousPublishedAt: Date | null,
): Date | null | undefined {
  if (publishedAt !== undefined) return publishedAt;
  if (isPublished && !previousPublishedAt) return new Date();
  return undefined;
}

// Validates `input` (throwing on invalid data, including a slug that's
// already taken), then creates a BlogPost row.
export async function createPost(input: CreatePostInput): Promise<BlogPost> {
  const data = createPostSchema.parse(input);
  assertValidSlug(data.slug, "post slug");

  const existing = await prisma.blogPost.findUnique({ where: { slug: data.slug } });
  if (existing) {
    throw new Error(`Post with slug "${data.slug}" already exists`);
  }

  return prisma.blogPost.create({
    data: {
      slug: data.slug,
      titleEn: data.titleEn,
      titleAr: data.titleAr,
      excerptEn: data.excerptEn,
      excerptAr: data.excerptAr,
      bodyEn: data.bodyEn,
      bodyAr: data.bodyAr,
      heroMediaId: data.heroMediaId ?? null,
      authorName: data.authorName ?? null,
      order: data.order ?? 0,
      isPublished: data.isPublished ?? false,
      publishedAt: resolvePublishedAt(data.isPublished, data.publishedAt, null) ?? null,
    },
  });
}

// Slug is immutable after creation — public URLs (/journal/[slug]) key off
// it.
export async function updatePost(id: string, input: UpdatePostInput): Promise<BlogPost> {
  const data = updatePostSchema.parse(input);

  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Post "${id}" not found`);
  }

  return prisma.blogPost.update({
    where: { id },
    data: {
      titleEn: data.titleEn,
      titleAr: data.titleAr,
      excerptEn: data.excerptEn,
      excerptAr: data.excerptAr,
      bodyEn: data.bodyEn,
      bodyAr: data.bodyAr,
      heroMediaId: data.heroMediaId,
      authorName: data.authorName,
      order: data.order,
      isPublished: data.isPublished,
      publishedAt: resolvePublishedAt(data.isPublished, data.publishedAt, existing.publishedAt),
    },
  });
}

export async function deletePost(id: string): Promise<void> {
  const existing = await prisma.blogPost.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Post "${id}" not found`);
  }
  await prisma.blogPost.delete({ where: { id } });
}
