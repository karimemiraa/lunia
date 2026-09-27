import Link from "next/link";
import { requireAdmin } from "../../../../_components/requireAdmin";
import { AdminShell } from "../../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listClinicalPhotos, type PhotoKind } from "@/modules/clinical/photos";
import { listTreatmentRecords } from "@/modules/clinical/treatments";
import { loadClient } from "../_components/loadClient";
import { PhotoUploader } from "../_components/PhotoUploader";
import { PhotoGallery } from "../_components/PhotoGallery";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ record?: string }>;
}

const dFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", dateStyle: "medium" });

// Clinical photos: upload (camera or bulk import of skin-analyzer exports),
// browse, edit labels, and compare before/after. Photos are private: every
// image on this page is served by the clinical:manage-gated route.
export default async function ClinicalPhotosPage({ params, searchParams }: Props) {
  const [{ id }, { record }] = await Promise.all([params, searchParams]);
  const user = await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  const client = await loadClient(id);
  const [photos, records] = await Promise.all([listClinicalPhotos(id), listTreatmentRecords(id)]);
  const recordOptions = records.map((r) => ({ id: r.id, label: `${r.serviceName ?? "Treatment"}, ${dFmt.format(r.performedAt)}` }));

  return (
    <AdminShell
      user={user}
      title="Clinical photos"
      description={`${client.displayName}. Private: visible only to staff with patient-file access, never on the public site.`}
      actions={
        <Link href={`/admin/clients/${id}`} className="lunia-btn lunia-btn-ghost min-h-11">
          Back to customer
        </Link>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="lunia-card p-5">
          <PhotoUploader
            clientProfileId={id}
            records={recordOptions}
            defaultRecordId={record && records.some((r) => r.id === record) ? record : null}
          />
        </section>
        <PhotoGallery
          photos={photos.map((p) => ({
            id: p.id,
            kind: p.kind as PhotoKind,
            area: p.area,
            device: p.device,
            note: p.note,
            treatmentRecordId: p.treatmentRecordId,
            takenAtLabel: dFmt.format(p.takenAt),
          }))}
          recordLabels={Object.fromEntries(recordOptions.map((r) => [r.id, r.label]))}
        />
      </div>
    </AdminShell>
  );
}
