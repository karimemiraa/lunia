import type { BlogPost } from "@prisma/client";
import { prisma } from "@/lib/db";

// Lists published blog posts, newest first (by publishedAt).
export async function listPublishedPosts(): Promise<BlogPost[]> {
  return prisma.blogPost.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: "desc" },
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
