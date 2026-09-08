"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { createBrand, updateBrand, deleteBrand } from "@/modules/catalog/brands";

export interface BrandActionState {
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
  revalidatePath("/admin/catalog/brands");
  revalidatePath("/", "layout");
}

export async function createBrandAction(_prev: BrandActionState | null, formData: FormData): Promise<BrandActionState> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const slug = String(formData.get("slug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const desc = readLocalized(formData, "desc");
  const whyChosen = readLocalized(formData, "whyChosen");

  if (!slug || !name) {
    return { error: "Slug and name are required." };
  }

  try {
    await createBrand({
      slug,
      name,
      descEn: desc.en,
      descAr: desc.ar,
      whyChosenEn: whyChosen.en,
      whyChosenAr: whyChosen.ar,
      url: stringOrNull(formData, "url"),
      logoMediaId: stringOrNull(formData, "logoMediaId"),
      order: numberOrUndefined(formData, "order"),
      isPublished: formData.get("isPublished") === "on",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create brand." };
  }

  revalidatePublic();
  return { success: true };
}

export async function updateBrandAction(_prev: BrandActionState | null, formData: FormData): Promise<BrandActionState> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Missing brand." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const desc = readLocalized(formData, "desc");
  const whyChosen = readLocalized(formData, "whyChosen");

  try {
    await updateBrand(id, {
      name: name || undefined,
      descEn: desc.en,
      descAr: desc.ar,
      whyChosenEn: whyChosen.en,
      whyChosenAr: whyChosen.ar,
      url: stringOrNull(formData, "url"),
      logoMediaId: stringOrNull(formData, "logoMediaId"),
      order: numberOrUndefined(formData, "order"),
      isPublished: formData.get("isPublished") === "on",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update brand." };
  }

  revalidatePublic();
  revalidatePath(`/admin/catalog/brands/${id}`);
  return { success: true };
}

export async function deleteBrandAction(formData: FormData): Promise<void> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await deleteBrand(id);
  revalidatePublic();
}
