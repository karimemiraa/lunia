"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { createService, updateService, deleteService } from "@/modules/catalog/services";
import { updateServiceBookingSettings } from "@/modules/booking/serviceSettings";
import { setServiceAccessRule } from "@/modules/booking/accessRules";

export interface ServiceActionState {
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

// Parses a newline-separated textarea into a string[], dropping blank lines
// and surrounding whitespace. Stored as Json on Service.benefitsEn/Ar.
function parseBenefits(formData: FormData, name: string): string[] {
  const raw = String(formData.get(name) ?? "");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function revalidatePublic(): void {
  revalidatePath("/admin/catalog/services");
  revalidatePath("/", "layout");
}

export async function createServiceAction(
  _prev: ServiceActionState | null,
  formData: FormData,
): Promise<ServiceActionState> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const slug = String(formData.get("slug") ?? "").trim();
  const departmentId = String(formData.get("departmentId") ?? "").trim();
  const name = readLocalized(formData, "name");
  const summary = readLocalized(formData, "summary");

  if (!slug || !departmentId || !name.en || !name.ar) {
    return { error: "Slug, department, and name (EN/AR) are required." };
  }

  try {
    await createService({
      slug,
      departmentId,
      nameEn: name.en,
      nameAr: name.ar,
      summaryEn: summary.en,
      summaryAr: summary.ar,
      benefitsEn: parseBenefits(formData, "benefitsEn"),
      benefitsAr: parseBenefits(formData, "benefitsAr"),
      heroMediaId: mediaIdOrNull(formData, "heroMediaId"),
      order: numberOrUndefined(formData, "order"),
      isPublished: formData.get("isPublished") === "on",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create service." };
  }

  revalidatePublic();
  return { success: true };
}

export async function updateServiceAction(
  _prev: ServiceActionState | null,
  formData: FormData,
): Promise<ServiceActionState> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Missing service." };
  }

  const departmentId = String(formData.get("departmentId") ?? "").trim();
  const name = readLocalized(formData, "name");
  const summary = readLocalized(formData, "summary");

  const durationMin = numberOrUndefined(formData, "durationMin");
  const priceSar = numberOrUndefined(formData, "priceSar");
  const minTierId = String(formData.get("minTierId") ?? "").trim();

  if (durationMin === undefined || durationMin <= 0) {
    return { error: "Duration must be a positive number of minutes." };
  }
  if (priceSar === undefined || priceSar < 0) {
    return { error: "Price must be zero or greater." };
  }

  try {
    await updateService(id, {
      departmentId: departmentId || undefined,
      nameEn: name.en,
      nameAr: name.ar,
      summaryEn: summary.en,
      summaryAr: summary.ar,
      benefitsEn: parseBenefits(formData, "benefitsEn"),
      benefitsAr: parseBenefits(formData, "benefitsAr"),
      heroMediaId: mediaIdOrNull(formData, "heroMediaId"),
      order: numberOrUndefined(formData, "order"),
      isPublished: formData.get("isPublished") === "on",
    });
    await updateServiceBookingSettings(id, {
      durationMin,
      priceMinor: Math.round(priceSar * 100),
      onlineBookable: formData.get("onlineBookable") === "on",
      inCenterOnly: formData.get("inCenterOnly") === "on",
    });
    await setServiceAccessRule(id, minTierId || null);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update service." };
  }

  revalidatePublic();
  revalidatePath(`/admin/catalog/services/${id}`);
  return { success: true };
}

export async function deleteServiceAction(formData: FormData): Promise<void> {
  await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await deleteService(id);
  revalidatePublic();
}
