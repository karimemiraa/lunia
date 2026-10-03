import { z } from "zod";
import { prisma } from "@/lib/db";

const businessSettingsSchema = z.object({
  nameEn: z.string(),
  nameAr: z.string(),
  addressEn: z.string(),
  addressAr: z.string(),
  phone: z.string(),
  whatsapp: z.string(),
  email: z.string(),
});
export type BusinessSettings = z.infer<typeof businessSettingsSchema>;

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const dayHoursSchema = z.object({
  open: z.string(),
  close: z.string(),
  closed: z.boolean(),
});

const hoursSettingsSchema = z.object(
  Object.fromEntries(DAYS.map((day) => [day, dayHoursSchema])) as Record<(typeof DAYS)[number], typeof dayHoursSchema>,
);
export type HoursSettings = z.infer<typeof hoursSettingsSchema>;

const socialSettingsSchema = z.object({
  instagram: z.string(),
  tiktok: z.string().optional(),
  snapchat: z.string().optional(),
  x: z.string().optional(),
});
export type SocialSettings = z.infer<typeof socialSettingsSchema>;

const seoSettingsSchema = z.object({
  defaultTitleEn: z.string(),
  defaultTitleAr: z.string(),
  defaultDescEn: z.string(),
  defaultDescAr: z.string(),
});
export type SeoSettings = z.infer<typeof seoSettingsSchema>;

const heroSettingsSchema = z.object({
  mediaId: z.string().nullable().optional(),
  headlineEn: z.string(),
  headlineAr: z.string(),
  ctaEn: z.string(),
  ctaAr: z.string(),
});
export type HeroSettings = z.infer<typeof heroSettingsSchema>;

// Global communications defaults. otpChannel is the fallback delivery channel
// for one-time codes when a client has no explicit per-client preference.
// AUTO = derive from the identifier (email identifier -> email; phone -> the
// booking channel).
const commsSettingsSchema = z.object({
  otpChannel: z.enum(["AUTO", "WHATSAPP", "SMS", "EMAIL"]).default("AUTO"),
  // Default channel for booking messages (confirmations/reminders) when a
  // client has no personal preference. Overrides the env-derived default.
  defaultBookingChannel: z.enum(["whatsapp", "sms"]).optional(),
});
export type CommsSettings = z.infer<typeof commsSettingsSchema>;

// The login/registration identifier the website accepts, derived from the
// OTP channel choice: EMAIL → email only, WHATSAPP/SMS → phone only, AUTO →
// both. This is what "choosing email only means OTP only works through email"
// maps to on the public login page.
export type LoginIdentifierMode = "email" | "phone" | "both";
export function loginIdentifierMode(otpChannel: CommsSettings["otpChannel"]): LoginIdentifierMode {
  if (otpChannel === "EMAIL") return "email";
  if (otpChannel === "WHATSAPP" || otpChannel === "SMS") return "phone";
  return "both";
}

// Loyalty economics — how spend converts to points and back. Stored in minor
// currency units (halalas) to match priceMinorSnapshot everywhere.
//   earnMinorPerPoint   = halalas of spend that earn 1 point (100 = 1 SAR).
//   redeemMinorPerPoint = halalas of discount granted per redeemed point (1 = 0.01 SAR).
const loyaltySettingsSchema = z.object({
  earnMinorPerPoint: z.number().int().positive().default(100),
  redeemMinorPerPoint: z.number().int().positive().default(1),
});
export type LoyaltySettings = z.infer<typeof loyaltySettingsSchema>;

// Seller / VAT identity printed on every tax invoice and encoded in the ZATCA
// QR + UBL XML (see src/modules/billing/settings.ts for defaults + the
// "is this complete enough to issue invoices" check). ZATCA requires the
// full national address (building no., street, district, city, postal code).
// pricesIncludeVat: catalog/service prices are VAT-inclusive (the site shows
// consumer prices, which must include VAT in KSA) — invoices back-compute the
// exclusive amount from them.
const taxSettingsSchema = z.object({
  sellerNameAr: z.string().default(""),
  sellerNameEn: z.string().default(""),
  // 15 digits, starts and ends with 3 (ZATCA format); "" until configured.
  vatNumber: z.string().regex(/^(3\d{13}3)?$/, "VAT number must be 15 digits starting and ending with 3").default(""),
  crNumber: z.string().default(""),
  buildingNo: z.string().default(""),
  street: z.string().default(""),
  district: z.string().default(""),
  city: z.string().default(""),
  postalCode: z.string().default(""),
  additionalNo: z.string().default(""),
  invoicePrefix: z.string().regex(/^[A-Z0-9]{1,8}$/).default("INV"),
  creditNotePrefix: z.string().regex(/^[A-Z0-9]{1,8}$/).default("CN"),
  pricesIncludeVat: z.boolean().default(true),
  defaultVatRateBp: z.number().int().min(0).max(10_000).default(1500),
});
export type TaxSettings = z.infer<typeof taxSettingsSchema>;

// Website appearance: which of the built-in themes the public site wears.
// Themes are pure token sets in globals.css ([data-theme=...]), so switching
// is one setting write + revalidate — no rebuild.
export const THEME_KEYS = ["luminous", "midnight", "aurora", "dune"] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];
// Homepage / site "edition" — the design & chrome: classic (the original
// cinematic site), cinematic (that body + the Serene glass nav), soft (the
// Soft-UI booking-first design), or motion (the flagship scroll experience).
export const EDITION_KEYS = ["classic", "cinematic", "soft", "motion"] as const;
export type EditionKey = (typeof EDITION_KEYS)[number];
const appearanceSettingsSchema = z.object({
  theme: z.enum(THEME_KEYS).default("luminous"),
  edition: z.enum(EDITION_KEYS).default("cinematic"),
});
export type AppearanceSettings = z.infer<typeof appearanceSettingsSchema>;

// Staff navigation: menu items the superadmin has hidden from everyone who
// lacks platform:manage (hrefs as listed in AdminNav's GROUPS).
const adminNavSettingsSchema = z.object({
  hiddenHrefs: z.array(z.string()).default([]),
});
export type AdminNavSettings = z.infer<typeof adminNavSettingsSchema>;

export const settingsRegistry = {
  business: businessSettingsSchema,
  hours: hoursSettingsSchema,
  social: socialSettingsSchema,
  seo: seoSettingsSchema,
  hero: heroSettingsSchema,
  comms: commsSettingsSchema,
  loyalty: loyaltySettingsSchema,
  tax: taxSettingsSchema,
  appearance: appearanceSettingsSchema,
  adminNav: adminNavSettingsSchema,
} as const;

export type SettingKey = keyof typeof settingsRegistry;

export type SettingValue<K extends SettingKey> = z.infer<(typeof settingsRegistry)[K]>;

// Re-export the fixed day list in case callers need to iterate hours in order.
export { DAYS as SETTINGS_DAYS };

// Reads the SiteSetting row for `key` and parses it with that key's schema.
// Returns null if no row exists. Throws if a row exists but is corrupt
// (fails schema validation).
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K> | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key } });
  if (!row) return null;

  const schema = settingsRegistry[key];
  const result = schema.safeParse(row.value);
  if (!result.success) {
    throw new Error(`SiteSetting row for key "${key}" failed schema validation: ${result.error.message}`);
  }
  return result.data as SettingValue<K>;
}

// Validates `value` against the schema for `key` (throwing on invalid
// input), then upserts the SiteSetting row.
export async function setSetting<K extends SettingKey>(key: K, value: SettingValue<K>): Promise<void> {
  const schema = settingsRegistry[key];
  const validated = schema.parse(value);
  await prisma.siteSetting.upsert({
    where: { key },
    create: { key, value: validated },
    update: { value: validated },
  });
}

// Returns every known setting key that currently has a row, parsed with its
// schema. Keys with no row (or a corrupt row) are omitted rather than
// throwing, since this is meant for read-heavy admin/display use.
export async function getAllSettings(): Promise<Partial<Record<SettingKey, unknown>>> {
  const keys = Object.keys(settingsRegistry) as SettingKey[];
  const rows = await prisma.siteSetting.findMany({ where: { key: { in: keys } } });

  const result: Partial<Record<SettingKey, unknown>> = {};
  for (const row of rows) {
    const key = row.key as SettingKey;
    const schema = settingsRegistry[key];
    const parsed = schema.safeParse(row.value);
    if (parsed.success) {
      result[key] = parsed.data;
    }
  }
  return result;
}
