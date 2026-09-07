"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { upsertPageContent, type PageContentData } from "@/modules/cms/pageContent";

export interface SavePageContentState {
  error?: string;
  success?: boolean;
}

function readLocalized(formData: FormData, name: string): { en: string; ar: string } {
  return {
    en: String(formData.get(`${name}.en`) ?? ""),
    ar: String(formData.get(`${name}.ar`) ?? ""),
  };
}

// Saves the `hero` section for a page. Reads the plain + `${field}.en` /
// `${field}.ar` fields emitted by LocalizedField, shapes them into a
// PageContentData object, and upserts it (upsertPageContent validates the
// shape via pageContentSchema before writing).
export async function savePageContent(
  _prev: SavePageContentState | null,
  formData: FormData,
): Promise<SavePageContentState> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const pageKey = String(formData.get("pageKey") ?? "").trim();
  if (!pageKey) {
    return { error: "Missing page key." };
  }

  const heroMediaIdRaw = String(formData.get("heroMediaId") ?? "").trim();
  const heroMediaId = heroMediaIdRaw.length > 0 ? heroMediaIdRaw : null;

  const data: PageContentData = {
    sections: [
      {
        key: "hero",
        type: "hero",
        heroMediaId,
        fields: {
          headline: readLocalized(formData, "headline"),
          cta: readLocalized(formData, "cta"),
          intro: readLocalized(formData, "intro"),
        },
      },
    ],
  };

  try {
    await upsertPageContent(pageKey, data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save page content." };
  }

  revalidatePath(`/admin/content/${pageKey}`);
  revalidatePath("/", "layout");

  return { success: true };
}
