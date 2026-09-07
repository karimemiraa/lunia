import { z } from "zod";
import { prisma } from "@/lib/db";

const localizedFieldSchema = z.object({
  en: z.string(),
  ar: z.string(),
});

const sectionSchema = z.object({
  key: z.string(),
  type: z.string(),
  heroMediaId: z.string().nullable().optional(),
  fields: z.record(z.string(), localizedFieldSchema),
});

export const pageContentSchema = z.object({
  sections: z.array(sectionSchema),
});

export type PageContentData = z.infer<typeof pageContentSchema>;

// Reads the PageContent row for pageKey and parses its `data` column with
// pageContentSchema. Returns null if no row exists. Throws a clear error if
// a row exists but its data no longer matches the schema.
export async function getPageContent(pageKey: string): Promise<PageContentData | null> {
  const row = await prisma.pageContent.findUnique({ where: { pageKey } });
  if (!row) return null;

  const result = pageContentSchema.safeParse(row.data);
  if (!result.success) {
    throw new Error(
      `PageContent row for pageKey "${pageKey}" failed schema validation: ${result.error.message}`,
    );
  }
  return result.data;
}

// Validates content against pageContentSchema (throwing on invalid input),
// then upserts the row.
export async function upsertPageContent(pageKey: string, content: PageContentData): Promise<void> {
  const validated = pageContentSchema.parse(content);
  await prisma.pageContent.upsert({
    where: { pageKey },
    create: { pageKey, data: validated },
    update: { data: validated },
  });
}
