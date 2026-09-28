import Link from "next/link";
import { requireAdmin } from "../admin/_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { SECRET_GROUPS, getSecretsStatus, listCustomCredentials } from "@/modules/platform/secrets";
import { listStages } from "@/modules/crm/pipeline";
import { SecretsForm } from "./SecretsForm";
import { CustomCredentials } from "./CustomCredentials";
import { PipelineStagesEditor } from "./PipelineStagesEditor";
import { ThemePicker } from "./ThemePicker";
import { NavVisibilityEditor } from "./NavVisibilityEditor";
import { NAV_CATALOG } from "../admin/_components/AdminNav";
import { getSetting } from "@/modules/cms/settings";

export const metadata = { title: "Superadmin — Lunia" };

// Superadmin control room: platform + technical setup, owner-only
// (PLATFORM_MANAGE). Deliberately a separate area from /admin with its own
// chrome; everything the day-to-day team uses stays in /admin.
export default async function SuperadminPage() {
  await requireAdmin(PERMISSIONS.PLATFORM_MANAGE);
  const [status, custom, stages, appearance, adminNav] = await Promise.all([
    getSecretsStatus(),
    listCustomCredentials(),
    listStages(),
    getSetting("appearance").catch(() => null),
    getSetting("adminNav").catch(() => null),
  ]);

  return (
    <div className="min-h-screen bg-[var(--color-page)] text-[var(--color-ink)]">
      {/* Distinct dark control-room header. */}
      <header className="lunia-teal-field lunia-pattern-waves lunia-pattern-multiply relative">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-5 lg:px-10">
          <div className="flex flex-col gap-1">
            <span role="img" aria-label="LUNIA" className="lunia-logo mb-1 h-6 text-[var(--color-teal-ink)]" />
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--color-teal-ink)]">Superadmin</span>
            <h1 className="font-[family-name:var(--font-display)] text-2xl">Platform &amp; Integrations</h1>
          </div>
          <Link
            href="/admin"
            className="rounded-[var(--radius)] border border-[var(--color-ink)]/20 bg-white/40 px-4 py-2 text-sm text-[var(--color-ink)] transition-colors hover:bg-white/70"
          >
            ← Back to admin
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8 lg:px-10">
        <p className="max-w-2xl text-sm text-[var(--color-ink)]/60">
          Technical &amp; marketing setup for the whole platform. Secrets are stored securely and shown only as a
          masked hint — enter a new value to replace one, or leave a field blank to keep the current value.
        </p>

        <ThemePicker current={appearance?.theme ?? "luminous"} />

        <NavVisibilityEditor catalog={NAV_CATALOG} hidden={adminNav?.hiddenHrefs ?? []} />

        <PipelineStagesEditor stages={stages} />

        {SECRET_GROUPS.map((group) => (
          <SecretsForm key={group.id} group={group} status={status} />
        ))}

        <CustomCredentials credentials={custom} />
      </main>
    </div>
  );
}
