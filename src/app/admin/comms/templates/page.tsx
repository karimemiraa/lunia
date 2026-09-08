import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listTemplates } from "@/modules/comms/templates";
import { TemplateCard } from "./TemplateCard";

// Placeholder tokens available to each template kind's bodyTemplate (see
// modules/booking/outbox.ts's payloadToParams and clientAuth.ts's OTP flow
// for where these are actually filled in).
const PLACEHOLDERS: Record<string, string[]> = {
  CONFIRMATION: ["serviceName", "dateTime", "bookingId"],
  REMINDER_24H: ["serviceName", "dateTime", "bookingId"],
  POST_VISIT: ["serviceName", "dateTime", "bookingId"],
  OTP: ["code"],
};

export default async function CommsTemplatesPage() {
  const user = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  const templates = await listTemplates();

  const sorted = [...templates].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    if (a.locale !== b.locale) return a.locale.localeCompare(b.locale);
    return a.channel.localeCompare(b.channel);
  });

  return (
    <AdminShell
      user={user}
      title="Message Templates"
      description="Edit the WhatsApp/SMS body sent for each booking event, per language and channel."
    >
      <div className="flex max-w-2xl flex-col gap-4" data-testid="templates-list">
        {sorted.length === 0 ? (
          <p className="text-sm text-[var(--color-ink)]/60">No templates yet.</p>
        ) : (
          sorted.map((tpl) => <TemplateCard key={tpl.id} template={tpl} placeholders={PLACEHOLDERS[tpl.kind] ?? []} />)
        )}
      </div>
    </AdminShell>
  );
}
