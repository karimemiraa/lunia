import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listTemplates } from "@/modules/comms/templates";
import {
  TEMPLATE_CHANNELS,
  TEMPLATE_KINDS,
  TEMPLATE_LOCALES,
  defaultBody,
} from "@/modules/comms/templateCatalog";
import { TemplateStudio, type StudioTemplate } from "./TemplateStudio";

// Presents the full kind × channel × locale matrix so every message the
// customer can receive is selectable — even combos with no MessageTemplate
// row yet (those show their built-in default body and become real rows on
// first save). Ordering: grouped by kind, email first, Arabic first (the
// default site locale).
export default async function CommsTemplatesPage() {
  const user = await requireAdmin(PERMISSIONS.SETTINGS_MANAGE);
  const rows = await listTemplates();

  const byKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) byKey.set(`${r.kind}|${r.locale}|${r.channel}`, r);

  const templates: StudioTemplate[] = [];
  for (const kind of TEMPLATE_KINDS) {
    for (const channel of TEMPLATE_CHANNELS) {
      for (const locale of TEMPLATE_LOCALES) {
        const existing = byKey.get(`${kind}|${locale}|${channel}`);
        templates.push({
          kind,
          locale,
          channel,
          bodyTemplate: existing?.bodyTemplate ?? defaultBody(kind, locale),
          providerTemplateName: existing?.providerTemplateName ?? null,
          isActive: existing?.isActive ?? true,
          exists: Boolean(existing),
        });
      }
    }
  }

  return (
    <AdminShell
      user={user}
      title="Message Templates"
      description="Pick any message the customer receives — email, WhatsApp, or SMS — edit its content in Arabic or English, and preview it exactly as they'll see it."
    >
      <div className="lunia-card p-6">
        <TemplateStudio templates={templates} />
      </div>
    </AdminShell>
  );
}
