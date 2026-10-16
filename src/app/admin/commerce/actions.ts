"use server";

// Server actions backing the admin Commerce page (page.tsx) and its client
// components (IssueGiftCardForm, VoidGiftCardButton, CreatePackageForm,
// AssignPackageForm). Every action re-checks SETTINGS_MANAGE itself -- never
// trusts that the page that rendered the control already checked it --
// mirroring admin/tiers/actions.ts and admin/clients/[id]/actions.ts.
// Mutations are audited (issuing money-equivalent instruments and creating
// sellable products are both sensitive) and revalidate this page's path.

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import { issueGiftCard, voidGiftCard } from "@/modules/commerce/giftcards";
import { createPackage, purchasePackage, updatePackage } from "@/modules/commerce/packages";
import { getStaffT } from "../_i18n/display";

export interface CommerceActionState {
  error?: string;
  success?: boolean;
  issuedCode?: string;
}

function revalidateCommerce(): void {
  revalidatePath("/admin/commerce");
}

const issueGiftCardSchema = z.object({
  // Entered by the admin in whole SAR; converted to minor units (halalas)
  // here so every stored amount stays an integer minor unit, per the
  // project-wide money convention.
  amountSar: z.coerce.number().positive("Enter an amount greater than zero."),
  clientProfileId: z.string().trim().optional(),
  expiresAt: z.string().trim().optional(),
});

export async function issueGiftCardAction(
  _prev: CommerceActionState | null,
  formData: FormData,
): Promise<CommerceActionState> {
  const admin = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  const t = await getStaffT();

  const parsed = issueGiftCardSchema.safeParse({
    amountSar: formData.get("amountSar"),
    clientProfileId: formData.get("clientProfileId"),
    expiresAt: formData.get("expiresAt"),
  });
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "Invalid input.") };
  }
  const { amountSar, clientProfileId, expiresAt } = parsed.data;
  const initialMinor = Math.round(amountSar * 100);

  let expiresAtDate: Date | undefined;
  if (expiresAt) {
    const parsedDate = new Date(expiresAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return { error: t("Invalid expiry date.") };
    }
    expiresAtDate = parsedDate;
  }

  try {
    const card = await issueGiftCard({
      initialMinor,
      issuedToClientId: clientProfileId || undefined,
      expiresAt: expiresAtDate,
    });

    await recordAudit({
      actorUserId: admin.id,
      action: "GIFTCARD_ISSUE",
      entityType: "GiftCard",
      entityId: card.id,
      summary: `Issued gift card "${card.code}" for ${amountSar} SAR${clientProfileId ? ` to client "${clientProfileId}"` : ""}`,
    });

    revalidateCommerce();
    return { success: true, issuedCode: card.code };
  } catch (err) {
    return { error: t(err instanceof Error ? err.message : "Failed to issue gift card.") };
  }
}

export async function voidGiftCardAction(
  _prev: CommerceActionState | null,
  formData: FormData,
): Promise<CommerceActionState> {
  const admin = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  const t = await getStaffT();

  const giftCardId = String(formData.get("giftCardId") ?? "").trim();
  if (!giftCardId) {
    return { error: t("Missing gift card.") };
  }

  try {
    const card = await voidGiftCard(giftCardId);
    await recordAudit({
      actorUserId: admin.id,
      action: "GIFTCARD_VOID",
      entityType: "GiftCard",
      entityId: card.id,
      summary: `Voided gift card "${card.code}"`,
    });
  } catch (err) {
    return { error: t(err instanceof Error ? err.message : "Failed to void gift card.") };
  }

  revalidateCommerce();
  return { success: true };
}

const createPackageSchema = z.object({
  nameEn: z.string().trim().min(1, "English name is required."),
  nameAr: z.string().trim().min(1, "Arabic name is required."),
  serviceId: z.string().trim().optional(),
  sessionsTotal: z.coerce.number().int().positive("Sessions must be a whole number greater than zero."),
  priceSar: z.coerce.number().nonnegative("Price cannot be negative."),
  isActive: z.boolean().default(true),
  // Blank = never expires.
  validityDays: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number().int("Validity must be a whole number of days.").positive("Validity must be at least 1 day.").max(3650).nullable(),
  ),
});

export async function createPackageAction(
  _prev: CommerceActionState | null,
  formData: FormData,
): Promise<CommerceActionState> {
  const admin = await requireAdmin(PERMISSIONS.CATALOG_MANAGE);
  const t = await getStaffT();

  const parsed = createPackageSchema.safeParse({
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr"),
    serviceId: formData.get("serviceId"),
    sessionsTotal: formData.get("sessionsTotal"),
    priceSar: formData.get("priceSar"),
    isActive: formData.get("isActive") === "on",
    validityDays: formData.get("validityDays"),
  });
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "Invalid input.") };
  }
  const { nameEn, nameAr, serviceId, sessionsTotal, priceSar, isActive, validityDays } = parsed.data;

  try {
    const pkg = await createPackage({
      nameEn,
      nameAr,
      serviceId: serviceId || undefined,
      sessionsTotal,
      priceMinor: Math.round(priceSar * 100),
      isActive,
      validityDays,
    });

    await recordAudit({
      actorUserId: admin.id,
      action: "PACKAGE_CREATE",
      entityType: "ServicePackage",
      entityId: pkg.id,
      summary: `Created package "${pkg.nameEn}" (${pkg.sessionsTotal} sessions, ${priceSar} SAR)`,
    });

    revalidateCommerce();
    return { success: true };
  } catch (err) {
    return { error: t(err instanceof Error ? err.message : "Failed to create package.") };
  }
}

// Edits a package definition or retires it (isActive=false). Existing
// purchases keep what they were sold with.
export async function updatePackageAction(
  _prev: CommerceActionState | null,
  formData: FormData,
): Promise<CommerceActionState> {
  const admin = await requireAdmin(PERMISSIONS.CATALOG_MANAGE);
  const t = await getStaffT();
  const packageId = String(formData.get("packageId") ?? "").trim();
  if (!packageId) return { error: t("Missing package.") };

  const parsed = createPackageSchema.safeParse({
    nameEn: formData.get("nameEn"),
    nameAr: formData.get("nameAr"),
    serviceId: formData.get("serviceId"),
    sessionsTotal: formData.get("sessionsTotal"),
    priceSar: formData.get("priceSar"),
    isActive: formData.get("isActive") === "on",
    validityDays: formData.get("validityDays"),
  });
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "Invalid input.") };
  }
  const { nameEn, nameAr, serviceId, sessionsTotal, priceSar, isActive, validityDays } = parsed.data;

  try {
    const pkg = await updatePackage(packageId, {
      nameEn,
      nameAr,
      serviceId: serviceId || null,
      sessionsTotal,
      priceMinor: Math.round(priceSar * 100),
      isActive,
      validityDays,
    });
    await recordAudit({
      actorUserId: admin.id,
      action: "PACKAGE_UPDATE",
      entityType: "ServicePackage",
      entityId: pkg.id,
      summary: `Updated package "${pkg.nameEn}" (${pkg.sessionsTotal} sessions, ${priceSar} SAR, ${validityDays ? `valid ${validityDays} days` : "no expiry"}${pkg.isActive ? "" : ", retired"})`,
    });
  } catch (err) {
    return { error: t(err instanceof Error ? err.message : "Failed to update package.") };
  }
  revalidateCommerce();
  return { success: true };
}

const assignPackageSchema = z.object({
  clientProfileId: z.string().trim().min(1, "Select a client."),
  packageId: z.string().trim().min(1, "Select a package."),
});

// Records that a client has purchased a package -- e.g. after they paid
// cash/card at the front desk (payments are off in this system, so this is
// the record-of-sale, not a charge). Guarded + audited like the actions
// above.
export async function assignPackageAction(
  _prev: CommerceActionState | null,
  formData: FormData,
): Promise<CommerceActionState> {
  const admin = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  const t = await getStaffT();

  const parsed = assignPackageSchema.safeParse({
    clientProfileId: formData.get("clientProfileId"),
    packageId: formData.get("packageId"),
  });
  if (!parsed.success) {
    return { error: t(parsed.error.issues[0]?.message ?? "Invalid input.") };
  }
  const { clientProfileId, packageId } = parsed.data;

  try {
    const purchase = await purchasePackage(clientProfileId, packageId);
    await recordAudit({
      actorUserId: admin.id,
      action: "PACKAGE_PURCHASE_RECORD",
      entityType: "PackagePurchase",
      entityId: purchase.id,
      summary: `Recorded package purchase for client "${clientProfileId}" (package "${packageId}")`,
    });
  } catch (err) {
    return { error: t(err instanceof Error ? err.message : "Failed to record package purchase.") };
  }

  revalidateCommerce();
  return { success: true };
}
