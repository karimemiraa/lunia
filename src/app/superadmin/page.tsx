import Link from "next/link";
import { requireAdmin } from "../admin/_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { SECRET_GROUPS, getSecretsStatus, listCustomCredentials } from "@/modules/platform/secrets";
import { listStages } from "@/modules/crm/pipeline";
import { SecretsForm } from "./SecretsForm";
import { CustomCredentials } from "./CustomCredentials";
import { PipelineStagesEditor } from "./PipelineStagesEditor";

export const metadata = { title: "Superadmin — Lunia" };

// Superadmin control room: platform + technical setup, owner-only
// (PLATFORM_MANAGE). Deliberately a separate area from /admin with its own
// chrome; everything the day-to-day team uses stays in /admin.
export default async function SuperadminPage() {
  await requireAdmin(PERMISSIONS.PLATFORM_MANAGE);
  const [status, custom, stages] = await Promise.all([getSecretsStatus(), listCustomCredentials(), listStages()]);

  return (
    <div className="min-h-screen bg-[var(--color-page)] text-[var(--color-ink)]">
      {/* Distinct dark control-room header. */}
      <header className="bg-[var(--color-forest)] text-[var(--color-cream)]">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-5 lg:px-10">
          <div className="flex flex-col gap-0.5">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--color-teal)]">Superadmin</span>
            <h1 className="font-[family-name:var(--font-display)] text-2xl">Platform &amp; Integrations</h1>
          </div>
          <Link
            href="/admin"
            className="rounded-[var(--radius)] border border-[var(--color-cream)]/30 px-4 py-2 text-sm text-[var(--color-cream)] transition-colors hover:bg-[var(--color-cream)]/10"
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

        <PipelineStagesEditor stages={stages} />

        {SECRET_GROUPS.map((group) => (
          <SecretsForm key={group.id} group={group} status={status} />
        ))}

        <CustomCredentials credentials={custom} />
      </main>
    </div>
  );
}
