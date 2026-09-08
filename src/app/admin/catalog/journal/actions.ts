"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { createPost, updatePost, deletePost } from "@/modules/catalog/journal";

export interface PostActionState {
  error?: string;
  success?: boolean;
}

function readLocalized(formData: FormData, name: string): { en: string; ar: string } {
  return {
    en: String(formData.get(`${name}.en`) ?? "").trim(),
    ar: String(formData.get(`${name}.ar`) ?? "").trim(),
  };
}

function numberOrUndefined(formData: FormData, name: string): number | undefined {
  const raw = formData.get(name);
  if (raw === null || String(raw).trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function stringOrNull(formData: FormData, name: string): string | null {
  const raw = String(formData.get(name) ?? "").trim();
  return raw.length > 0 ? raw : null;
}

function revalidatePublic(): void {
  revalidatePath("/admin/catalog/journal");
  revalidatePath("/", "layout");
}

export async function createPostAction(_prev: PostActionState | null, formData: FormData): Promise<PostActionState> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const slug = String(formData.get("slug") ?? "").trim();
  const title = readLocalized(formData, "title");
  const excerpt = readLocalized(formData, "excerpt");
  const body = readLocalized(formData, "body");

  if (!slug || !title.en || !title.ar || !body.en || !body.ar) {
    return { error: "Slug, title (EN/AR), and body (EN/AR) are required." };
  }

  try {
    await createPost({
      slug,
      titleEn: title.en,
      titleAr: title.ar,
      excerptEn: excerpt.en,
      excerptAr: excerpt.ar,
      bodyEn: body.en,
      bodyAr: body.ar,
      heroMediaId: stringOrNull(formData, "heroMediaId"),
      authorName: stringOrNull(formData, "authorName"),
      order: numberOrUndefined(formData, "order"),
      isPublished: formData.get("isPublished") === "on",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create post." };
  }

  revalidatePublic();
  return { success: true };
}

export async function updatePostAction(_prev: PostActionState | null, formData: FormData): Promise<PostActionState> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Missing post." };
  }

  const title = readLocalized(formData, "title");
  const excerpt = readLocalized(formData, "excerpt");
  const body = readLocalized(formData, "body");

  try {
    await updatePost(id, {
      titleEn: title.en,
      titleAr: title.ar,
      excerptEn: excerpt.en,
      excerptAr: excerpt.ar,
      bodyEn: body.en,
      bodyAr: body.ar,
      heroMediaId: stringOrNull(formData, "heroMediaId"),
      authorName: stringOrNull(formData, "authorName"),
      order: numberOrUndefined(formData, "order"),
      isPublished: formData.get("isPublished") === "on",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update post." };
  }

  revalidatePublic();
  revalidatePath(`/admin/catalog/journal/${id}`);
  return { success: true };
}

export async function deletePostAction(formData: FormData): Promise<void> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await deletePost(id);
  revalidatePublic();
}
