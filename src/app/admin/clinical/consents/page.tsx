import Link from "next/link";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { ensureDefaultConsentForms, listConsentForms } from "@/modules/clinical/consents";
import { recordAudit } from "@/modules/iam/audit";
import { servicesForPicker } from "./servicesForPicker";

const dFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", dateStyle: "medium" });

// Consent-form templates. The first visit seeds three defaults (general
// treatment, photography, post-surgery drainage) when none exist yet.
export default async function ConsentFormsPage() {
  const user = await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  const seeded = await ensureDefaultConsentForms();
  if (seeded > 0) {
    await recordAudit({
      actorUserId: user.id,
      action: "clinical.consent_form.seed_defaults",
      entityType: "ConsentForm",
      summary: `Created ${seeded} default consent form templates`,
    });
  }
  const [forms, services] = await Promise.all([listConsentForms(), servicesForPicker()]);
  const serviceName = new Map(services.map((s) => [s.id, s.label]));

  return (
    <AdminShell
      user={user}
      title="Consent forms"
      description="Bilingual consent templates customers sign online or at the desk. Editing the wording creates a new version; signed copies keep the exact text they agreed to."
      actions={
        <Link href="/admin/clinical/consents/new" className="lunia-btn lunia-btn-forest min-h-11">
          New form
        </Link>
      }
    >
      {seeded > 0 && (
        <p className="mb-5 rounded-[var(--radius-sm)] bg-[var(--color-teal)]/12 px-4 py-3 text-sm text-[var(--color-ink)]">
          We added {seeded} starter templates. Please have your medical director review the wording before relying on them.
        </p>
      )}
      <ul className="grid gap-3 md:grid-cols-2" data-testid="consent-forms-list">
        {forms.map((f) => (
          <li key={f.id} className="lunia-card flex flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-ink)]">{f.titleEn}</p>
                <p className="text-sm text-[var(--color-ink)]/60" dir="rtl" lang="ar">
                  {f.titleAr}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${f.isActive ? "bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]" : "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/55"}`}
              >
                {f.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="text-xs text-[var(--color-ink)]/55">
              <span className="font-mono">{f.key}</span> · v{f.version} · updated {dFmt.format(f.updatedAt)} · {f._count.signatures} signature{f._count.signatures === 1 ? "" : "s"}
            </p>
            <p className="text-xs text-[var(--color-ink)]/65">
              {f.serviceIds.length === 0 ? "Not tied to a service" : `Required for: ${f.serviceIds.map((id) => serviceName.get(id) ?? "Removed service").join(", ")}`}
            </p>
            <Link href={`/admin/clinical/consents/${f.id}`} className="lunia-btn lunia-btn-ghost lunia-btn-sm mt-auto min-h-11 self-start">
              Edit
            </Link>
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}
