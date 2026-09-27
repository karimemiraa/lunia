import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../_components/requireAdmin";
import { AdminShell } from "../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getConsentForm } from "@/modules/clinical/consents";
import { ConsentFormEditor } from "../ConsentFormEditor";
import { servicesForPicker } from "../servicesForPicker";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}

export default async function EditConsentFormPage({ params, searchParams }: Props) {
  const [{ id }, { created }] = await Promise.all([params, searchParams]);
  const user = await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  const [form, services] = await Promise.all([getConsentForm(id), servicesForPicker()]);
  if (!form) notFound();

  return (
    <AdminShell
      user={user}
      title={form.titleEn}
      description={`Version ${form.version}`}
      actions={
        <Link href="/admin/clinical/consents" className="lunia-btn lunia-btn-ghost min-h-11">
          All forms
        </Link>
      }
    >
      {created && <p className="mb-5 rounded-[var(--radius-sm)] bg-[var(--color-teal)]/12 px-4 py-3 text-sm">Form created.</p>}
      <div className="lunia-card p-5 sm:p-8">
        <ConsentFormEditor
          key={form.version}
          id={form.id}
          version={form.version}
          initial={{
            key: form.key,
            titleEn: form.titleEn,
            titleAr: form.titleAr,
            bodyEn: form.bodyEn,
            bodyAr: form.bodyAr,
            serviceIds: form.serviceIds,
            isActive: form.isActive,
          }}
          services={services}
        />
      </div>
    </AdminShell>
  );
}
