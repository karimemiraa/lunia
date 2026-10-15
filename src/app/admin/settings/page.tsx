import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { getStaffT } from "../_i18n/display";
import { PERMISSIONS } from "@/modules/iam/permissions";
import {
  getAllSettings,
  SETTINGS_DAYS,
  type BusinessSettings,
  type HoursSettings,
  type SocialSettings,
  type SeoSettings,
  type CommsSettings,
} from "@/modules/cms/settings";
import { getCommsConfig } from "@/modules/comms/config";
import { resolveBookingChannel } from "@/modules/booking/outbox";
import { SettingsForm } from "./SettingsForm";
import { AutomationsForm } from "./AutomationsForm";
import { JOBS, backupProblem, getAutomationSettings, latestJobRuns } from "@/modules/automation/jobs";

const DEFAULT_HOURS: HoursSettings = Object.fromEntries(
  SETTINGS_DAYS.map((day) => [day, { open: "09:00", close: "18:00", closed: false }]),
) as HoursSettings;

export default async function SettingsPage() {
  const user = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  const t = await getStaffT();
  const [settings, automations, runs] = await Promise.all([getAllSettings(), getAutomationSettings(), latestJobRuns()]);

  const business = settings.business as BusinessSettings | undefined;
  const hours = (settings.hours as HoursSettings | undefined) ?? DEFAULT_HOURS;
  const social = settings.social as SocialSettings | undefined;
  const seo = settings.seo as SeoSettings | undefined;
  const comms = settings.comms as CommsSettings | undefined;
  const bookingChannel = resolveBookingChannel(getCommsConfig());

  return (
    <AdminShell user={user} title="Settings" description="Business info, hours, social links, SEO, communications defaults and daily automations.">
      <SettingsForm
        name={{ en: business?.nameEn ?? "", ar: business?.nameAr ?? "" }}
        address={{ en: business?.addressEn ?? "", ar: business?.addressAr ?? "" }}
        phone={business?.phone ?? ""}
        whatsapp={business?.whatsapp ?? ""}
        email={business?.email ?? ""}
        hours={hours}
        instagram={social?.instagram ?? ""}
        tiktok={social?.tiktok ?? ""}
        snapchat={social?.snapchat ?? ""}
        x={social?.x ?? ""}
        defaultTitle={{ en: seo?.defaultTitleEn ?? "", ar: seo?.defaultTitleAr ?? "" }}
        defaultDesc={{ en: seo?.defaultDescEn ?? "", ar: seo?.defaultDescAr ?? "" }}
        otpChannel={comms?.otpChannel ?? "AUTO"}
        defaultBookingChannel={comms?.defaultBookingChannel ?? (bookingChannel === "sms" ? "sms" : "whatsapp")}
      />
      {(() => {
        const problem = backupProblem(runs.backup);
        return problem ? (
          <p className="mt-6 rounded-[var(--radius-sm)] border border-[var(--color-gold)]/45 bg-[var(--color-gold)]/10 px-4 py-3 text-sm" data-testid="backup-warning">
            <span className="font-medium">{t("Backups need attention:")}</span> {t(problem)}
          </p>
        ) : null;
      })()}
      <div className="mt-6">
        <AutomationsForm
          value={automations}
          jobs={JOBS.map((j) => ({
            name: j.name,
            label: j.label,
            hour: j.hour,
            lastRunIso: runs[j.name]?.startedAt.toISOString() ?? null,
            ok: runs[j.name]?.ok ?? null,
            summary: runs[j.name]?.summary ?? null,
          })).concat({
            name: "backup",
            label: "Database + media backup, encrypted and copied off-site (server cron)",
            hour: 2,
            lastRunIso: runs.backup?.startedAt.toISOString() ?? null,
            ok: runs.backup?.ok ?? null,
            summary: runs.backup?.summary ?? null,
          })}
        />
      </div>
    </AdminShell>
  );
}
