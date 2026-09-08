"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { createDepartment, updateDepartment, deleteDepartment } from "@/modules/catalog/departments";

export interface DepartmentActionState {
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

function mediaIdOrNull(formData: FormData, name: string): string | null {
  const raw = String(formData.get(name) ?? "").trim();
  return raw.length > 0 ? raw : null;
}

// Revalidates the admin list and every public surface that reads
// departments (the services index and each department detail page).
function revalidatePublic(): void {
  revalidatePath("/admin/catalog/departments");
  revalidatePath("/", "layout");
}

export async function createDepartmentAction(
  _prev: DepartmentActionState | null,
  formData: FormData,
): Promise<DepartmentActionState> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const slug = String(formData.get("slug") ?? "").trim();
  const name = readLocalized(formData, "name");
  const tagline = readLocalized(formData, "tagline");
  const desc = readLocalized(formData, "desc");

  if (!slug || !name.en || !name.ar) {
    return { error: "Slug and name (EN/AR) are required." };
  }

  try {
    await createDepartment({
      slug,
      nameEn: name.en,
      nameAr: name.ar,
      taglineEn: tagline.en,
      taglineAr: tagline.ar,
      descEn: desc.en,
      descAr: desc.ar,
      heroMediaId: mediaIdOrNull(formData, "heroMediaId"),
      order: numberOrUndefined(formData, "order"),
      isPublished: formData.get("isPublished") === "on",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create department." };
  }

  revalidatePublic();
  return { success: true };
}

export async function updateDepartmentAction(
  _prev: DepartmentActionState | null,
  formData: FormData,
): Promise<DepartmentActionState> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Missing department." };
  }

  const name = readLocalized(formData, "name");
  const tagline = readLocalized(formData, "tagline");
  const desc = readLocalized(formData, "desc");

  try {
    await updateDepartment(id, {
      nameEn: name.en,
      nameAr: name.ar,
      taglineEn: tagline.en,
      taglineAr: tagline.ar,
      descEn: desc.en,
      descAr: desc.ar,
      heroMediaId: mediaIdOrNull(formData, "heroMediaId"),
      order: numberOrUndefined(formData, "order"),
      isPublished: formData.get("isPublished") === "on",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update department." };
  }

  revalidatePublic();
  revalidatePath(`/admin/catalog/departments/${id}`);
  return { success: true };
}

export async function deleteDepartmentAction(formData: FormData): Promise<void> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await deleteDepartment(id);
  revalidatePublic();
}
