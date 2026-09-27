import Link from "next/link";
import { requireAdmin } from "../../../_components/requireAdmin";
import { AdminShell } from "../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { ConsentFormEditor } from "../ConsentFormEditor";
import { servicesForPicker } from "../servicesForPicker";

export default async function NewConsentFormPage() {
  const user = await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  const services = await servicesForPicker();
  return (
    <AdminShell
      user={user}
      title="New consent form"
      actions={
        <Link href="/admin/clinical/consents" className="lunia-btn lunia-btn-ghost min-h-11">
          All forms
        </Link>
      }
    >
      <div className="lunia-card p-5 sm:p-8">
        <ConsentFormEditor
          id={null}
          version={null}
          initial={{ key: "", titleEn: "", titleAr: "", bodyEn: "", bodyAr: "", serviceIds: [], isActive: true }}
          services={services}
        />
      </div>
    </AdminShell>
  );
}
