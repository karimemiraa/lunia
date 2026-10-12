// Public before/after results gallery, built from PRIVATE clinical photos.
// Safety rules (all enforced here, and re-checked when bytes are served):
//   1. A photo can only be used once staff record the customer's consent to
//      share it (ClinicalPhoto.consentToShare).
//   2. A pair is a BEFORE + an AFTER photo of the SAME customer.
//   3. The public route serves a photo only while its pair is published AND
//      both photos still have consent. Revoking consent unpublishes every
//      pair using that photo; deleting a photo deletes its pairs (FK cascade).
// No customer name, date or note ever leaves this module for the public site.

import { z } from "zod";
import { prisma } from "@/lib/db";

import { SHOWCASE_CATEGORIES, type ShowcaseCategory } from "./showcase.shared";

export { SHOWCASE_CATEGORIES, type ShowcaseCategory };
const CATEGORY_KEYS = SHOWCASE_CATEGORIES.map((c) => c.key) as [ShowcaseCategory, ...ShowcaseCategory[]];

/** Records (or withdraws) the customer's consent to show a photo publicly. Withdrawing unpublishes its pairs. */
export async function setPhotoShareConsent(photoId: string, consent: boolean) {
  const photo = await prisma.clinicalPhoto.update({ where: { id: photoId }, data: { consentToShare: consent } });
  let unpublished = 0;
  if (!consent) {
    const res = await prisma.resultShowcase.updateMany({
      where: { isPublished: true, OR: [{ beforePhotoId: photoId }, { afterPhotoId: photoId }] },
      data: { isPublished: false },
    });
    unpublished = res.count;
  }
  return { photo, unpublished };
}

const createSchema = z.object({
  beforePhotoId: z.string().min(1),
  afterPhotoId: z.string().min(1),
  category: z.enum(CATEGORY_KEYS),
  captionEn: z.string().trim().max(140).default(""),
  captionAr: z.string().trim().max(140).default(""),
  publish: z.boolean().default(false),
});
export type CreateShowcaseInput = z.input<typeof createSchema>;

export async function createShowcase(input: CreateShowcaseInput, createdById: string) {
  const data = createSchema.parse(input);
  if (data.beforePhotoId === data.afterPhotoId) throw new Error("Pick two different photos.");
  const [before, after] = await Promise.all([
    prisma.clinicalPhoto.findUnique({ where: { id: data.beforePhotoId } }),
    prisma.clinicalPhoto.findUnique({ where: { id: data.afterPhotoId } }),
  ]);
  if (!before || !after) throw new Error("Photo not found.");
  if (before.clientProfileId !== after.clientProfileId) throw new Error("Both photos must be of the same customer.");
  if (before.kind !== "BEFORE" || after.kind !== "AFTER") throw new Error("Pick one photo labelled Before and one labelled After.");
  if (!before.consentToShare || !after.consentToShare) throw new Error("The customer's consent to share must be recorded on both photos first.");
  return prisma.resultShowcase.create({
    data: {
      beforePhotoId: before.id,
      afterPhotoId: after.id,
      category: data.category,
      captionEn: data.captionEn,
      captionAr: data.captionAr,
      isPublished: data.publish,
      publishedAt: data.publish ? new Date() : null,
      createdById,
    },
  });
}

export async function setShowcasePublished(id: string, publish: boolean) {
  const sc = await prisma.resultShowcase.findUnique({ where: { id }, include: { beforePhoto: true, afterPhoto: true } });
  if (!sc) throw new Error("Not found.");
  if (publish && !(sc.beforePhoto.consentToShare && sc.afterPhoto.consentToShare)) {
    throw new Error("The customer's consent to share is no longer recorded on both photos.");
  }
  return prisma.resultShowcase.update({ where: { id }, data: { isPublished: publish, publishedAt: publish ? (sc.publishedAt ?? new Date()) : sc.publishedAt } });
}

export async function deleteShowcase(id: string) {
  await prisma.resultShowcase.delete({ where: { id } });
}

const PUBLIC_WHERE = { isPublished: true, beforePhoto: { consentToShare: true }, afterPhoto: { consentToShare: true } } as const;

/** What the public site may show: ids, category and captions only. */
export async function listPublishedShowcases() {
  const rows = await prisma.resultShowcase.findMany({
    where: PUBLIC_WHERE,
    orderBy: { publishedAt: "desc" },
    select: { id: true, category: true, captionEn: true, captionAr: true },
    take: 60,
  });
  return rows;
}

/** The photo behind a public gallery image, or null unless it may be shown right now. */
export async function getPublicShowcasePhoto(showcaseId: string, side: "before" | "after") {
  const sc = await prisma.resultShowcase.findFirst({
    where: { id: showcaseId, ...PUBLIC_WHERE },
    include: { beforePhoto: true, afterPhoto: true },
  });
  if (!sc) return null;
  return side === "before" ? sc.beforePhoto : sc.afterPhoto;
}

/** Every pair (admin overview), newest first, with the customer for staff. */
export async function listAllShowcases(filter: { clientProfileId?: string } = {}) {
  return prisma.resultShowcase.findMany({
    where: filter.clientProfileId ? { beforePhoto: { clientProfileId: filter.clientProfileId } } : {},
    orderBy: { createdAt: "desc" },
    include: {
      beforePhoto: { select: { id: true, clientProfileId: true, consentToShare: true, client: { select: { fullName: true } } } },
      afterPhoto: { select: { id: true, consentToShare: true } },
    },
    take: 200,
  });
}
