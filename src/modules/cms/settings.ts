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
});
export type CommsSettings = z.infer<typeof commsSettingsSchema>;

export const settingsRegistry = {
  business: businessSettingsSchema,
  hours: hoursSettingsSchema,
  social: socialSettingsSchema,
  seo: seoSettingsSchema,
  hero: heroSettingsSchema,
  comms: commsSettingsSchema,
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
