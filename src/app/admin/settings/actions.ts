"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import {
  setSetting,
  SETTINGS_DAYS,
  type BusinessSettings,
  type HoursSettings,
  type SocialSettings,
  type SeoSettings,
  type CommsSettings,
} from "@/modules/cms/settings";

export interface SaveSettingsState {
  error?: string;
  success?: boolean;
}

function str(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

// Empty optional social handles must be omitted (undefined), not stored as
// "" — the schema marks them optional, so undefined is the value that means
// "not set" once persisted as JSON.
function optionalStr(formData: FormData, name: string): string | undefined {
  const value = str(formData, name).trim();
  return value.length > 0 ? value : undefined;
}

const OTP_CHANNEL_VALUES = ["AUTO", "WHATSAPP", "SMS", "EMAIL"] as const;

// Falls back to "AUTO" for a missing/tampered value rather than throwing --
// this is a select the form always renders with a valid defaultValue, so an
// unrecognized value here only happens for a malformed direct POST.
function otpChannelFromForm(formData: FormData): CommsSettings["otpChannel"] {
  const raw = str(formData, "comms.otpChannel");
  return (OTP_CHANNEL_VALUES as readonly string[]).includes(raw)
    ? (raw as CommsSettings["otpChannel"])
    : "AUTO";
}

// Reads and validates every settings section from the combined settings form,
// then saves each one independently via setSetting (each call validates
// against that key's Zod schema before writing).
export async function saveSettings(_prev: SaveSettingsState | null, formData: FormData): Promise<SaveSettingsState> {
  const admin = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);

  const business: BusinessSettings = {
    nameEn: str(formData, "name.en"),
    nameAr: str(formData, "name.ar"),
    addressEn: str(formData, "address.en"),
    addressAr: str(formData, "address.ar"),
    phone: str(formData, "phone"),
    whatsapp: str(formData, "whatsapp"),
    email: str(formData, "email"),
  };

  const hours = Object.fromEntries(
    SETTINGS_DAYS.map((day) => [
      day,
      {
        open: str(formData, `hours.${day}.open`),
        close: str(formData, `hours.${day}.close`),
        closed: formData.get(`hours.${day}.closed`) === "on",
      },
    ]),
  ) as HoursSettings;

  const social: SocialSettings = {
    instagram: str(formData, "instagram"),
    tiktok: optionalStr(formData, "tiktok"),
    snapchat: optionalStr(formData, "snapchat"),
    x: optionalStr(formData, "x"),
  };

  const seo: SeoSettings = {
    defaultTitleEn: str(formData, "defaultTitle.en"),
    defaultTitleAr: str(formData, "defaultTitle.ar"),
    defaultDescEn: str(formData, "defaultDesc.en"),
    defaultDescAr: str(formData, "defaultDesc.ar"),
  };

  const comms: CommsSettings = {
    otpChannel: otpChannelFromForm(formData),
  };

  try {
    await setSetting("business", business);
    await setSetting("hours", hours);
    await setSetting("social", social);
    await setSetting("seo", seo);
    await setSetting("comms", comms);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save settings." };
  }

  await recordAudit({
    actorUserId: admin.id,
    action: "SETTINGS_UPDATE",
    entityType: "SiteSetting",
    summary: "Updated business, hours, social, SEO, and communications settings",
  });
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");

  return { success: true };
}
