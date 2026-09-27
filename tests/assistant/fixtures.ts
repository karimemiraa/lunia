import type { CatalogService } from "@/modules/assistant/recommend";
import type { HoursSettings } from "@/modules/cms/settings";

// Mirrors the seeded catalog (slugs/departments/flags), with fake ids.
const row = (
  slug: string,
  nameEn: string,
  departmentSlug: string,
  durationMin: number,
  priceMinor: number,
  extra: Partial<CatalogService> = {},
): CatalogService => ({
  id: `svc-${slug}`,
  slug,
  nameEn,
  nameAr: `${nameEn} (ar)`,
  summaryEn: `${nameEn}. A lovely treatment.`,
  summaryAr: `${nameEn} بالعربي.`,
  departmentSlug,
  durationMin,
  priceMinor,
  onlineBookable: true,
  inCenterOnly: false,
  tierName: null,
  ...extra,
});

export const CATALOG: CatalogService[] = [
  row("diagnostic-skin-analysis", "Diagnostic Skin Analysis", "skin", 45, 25000),
  row("signature-facials-hydrafacial", "Signature Facials & HydraFacial", "skin", 60, 65000),
  row("led-light-therapy", "LED Light Therapy", "skin", 30, 35000),
  row("microdermabrasion-peels", "Microdermabrasion & Peels", "skin", 45, 50000),
  row("scalp-diagnostic-analysis", "Scalp Diagnostic Analysis", "hair-scalp", 45, 25000),
  row("led-lllt-cap-therapy", "LED / LLLT Cap Therapy", "hair-scalp", 30, 40000),
  row("scalp-detox", "Scalp Detox", "hair-scalp", 45, 35000),
  row("scalp-massage-oxygen", "Scalp Massage & Oxygen Therapy", "hair-scalp", 60, 45000),
  row("manual-lymphatic-drainage", "Manual Lymphatic Drainage", "post-surgery", 60, 50000, { inCenterOnly: true }),
  row("pressotherapy", "Pressotherapy", "post-surgery", 45, 40000, { inCenterOnly: true }),
  row("compression-garment-guidance", "Compression Garment Guidance", "post-surgery", 30, 25000, { inCenterOnly: true }),
  row("recovery-lounge", "Recovery Lounge", "post-surgery", 90, 120000, { inCenterOnly: true }),
];

const day = { open: "10:00", close: "22:00", closed: false };
export const HOURS: HoursSettings = { mon: day, tue: day, wed: day, thu: day, fri: { ...day, closed: true }, sat: day, sun: day };
