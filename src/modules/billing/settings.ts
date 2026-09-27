// Seller / VAT settings for invoicing, stored in SiteSetting "tax" (schema in
// src/modules/cms/settings.ts). Reads always return a complete object (schema
// defaults fill any gap) so callers never branch on "not configured yet";
// taxSettingsIssues() says what is still missing before a tax invoice may be
// issued.

import { getSetting, setSetting, settingsRegistry, type TaxSettings } from "@/modules/cms/settings";

export type { TaxSettings };

export const DEFAULT_TAX_SETTINGS: TaxSettings = settingsRegistry.tax.parse({});

export async function getTaxSettings(): Promise<TaxSettings> {
  const stored = await getSetting("tax").catch(() => null);
  return stored ?? DEFAULT_TAX_SETTINGS;
}

export async function saveTaxSettings(value: TaxSettings): Promise<TaxSettings> {
  const parsed = settingsRegistry.tax.parse(value);
  await setSetting("tax", parsed);
  return parsed;
}

/** ZATCA VAT registration number: 15 digits, first and last digit 3. */
export function isValidVatNumber(vat: string): boolean {
  return /^3\d{13}3$/.test(vat);
}

// Fields a simplified tax invoice (and its ZATCA QR/XML) cannot go without.
// Returns human-readable problems; empty = ready to issue.
export function taxSettingsIssues(s: TaxSettings): string[] {
  const issues: string[] = [];
  if (!s.sellerNameAr.trim() && !s.sellerNameEn.trim()) issues.push("Seller legal name");
  if (!isValidVatNumber(s.vatNumber)) issues.push("VAT registration number");
  if (!s.crNumber.trim()) issues.push("Commercial registration (CR) number");
  if (!/^\d{4}$/.test(s.buildingNo)) issues.push("Building number (4 digits)");
  if (!s.street.trim()) issues.push("Street");
  if (!s.district.trim()) issues.push("District");
  if (!s.city.trim()) issues.push("City");
  if (!/^\d{5}$/.test(s.postalCode)) issues.push("Postal code (5 digits)");
  return issues;
}

/** Seller name for the QR/XML: Arabic legal name first (ZATCA's preference). */
export function sellerLegalName(s: TaxSettings): string {
  return s.sellerNameAr.trim() || s.sellerNameEn.trim();
}
