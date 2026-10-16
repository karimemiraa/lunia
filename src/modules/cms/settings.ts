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

// Scheduled automations run by the worker (src/modules/automation/jobs.ts).
// Customer-facing marketing (win-back) is OFF until an owner turns it on.
const automationSettingsSchema = z.object({
  packageReminderEnabled: z.boolean().default(true),
  packageReminderDays: z.number().int().min(1).max(60).default(14),
  winBackEnabled: z.boolean().default(false),
  winBackDays: z.number().int().min(30).max(365).default(90),
  /** Max win-back messages per day, so a first run can't flood the outbox. */
  winBackDailyCap: z.number().int().min(1).max(500).default(40),
  staffDigestEnabled: z.boolean().default(false),
  /** Re-send unpaid invoices (with pay link) to the customer — off until an owner enables it. */
  invoiceReminderEnabled: z.boolean().default(false),
  invoiceReminderDays: z.number().int().min(1).max(30).default(3),
  /** Mark appointments nobody checked in as no-shows after N hours — off by default. */
  autoNoShowEnabled: z.boolean().default(false),
  autoNoShowHours: z.number().int().min(2).max(168).default(24),
});
export type AutomationSettings = z.infer<typeof automationSettingsSchema>;
export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = automationSettingsSchema.parse({});

// In-clinic visit journey (src/modules/booking/journey.ts): live-board
// warning thresholds, room turnover and prayer times.
const journeySettingsSchema = z.object({
  /** Waiting timer turns amber / red after this many minutes. */
  waitAmberMin: z.number().int().min(1).max(120).default(10),
  waitRedMin: z.number().int().min(2).max(240).default(20),
  /** Customer at the checkout desk longer than this is flagged. */
  checkoutAmberMin: z.number().int().min(1).max(120).default(10),
  /** A room stays "being prepared" this long after a session unless marked ready sooner. */
  roomPrepareMin: z.number().int().min(0).max(60).default(10),
  /** Show the next prayer time (Riyadh, Umm al-Qura) on the board. */
  prayerTimes: z.boolean().default(true),
});
export type JourneySettings = z.infer<typeof journeySettingsSchema>;
export const DEFAULT_JOURNEY_SETTINGS: JourneySettings = journeySettingsSchema.parse({});

// Specialist discounts (docs/PRD-commission-discounts-roles.md §3.2).
const discountSettingsSchema = z.object({
  /** Specialists can give up to this % of the visit without approval. */
  specialistCapPct: z.number().int().min(0).max(100).default(10),
  /** Optional SAR ceiling (minor units) on top of the % cap; null = none. */
  maxMinor: z.number().int().min(0).nullable().default(null),
});
export type DiscountSettings = z.infer<typeof discountSettingsSchema>;
export const DEFAULT_DISCOUNT_SETTINGS: DiscountSettings = discountSettingsSchema.parse({});

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
  automations: automationSettingsSchema,
  journey: journeySettingsSchema,
  discounts: discountSettingsSchema,
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
