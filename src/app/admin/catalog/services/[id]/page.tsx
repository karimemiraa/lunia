import { notFound } from "next/navigation";
import { requireAdmin } from "../../../_components/requireAdmin";
import { AdminShell } from "../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getServiceById } from "@/modules/catalog/services";
import { listDepartments } from "@/modules/catalog/departments";
import { listMedia } from "@/modules/cms/media";
import { EditServiceForm } from "./EditServiceForm";

interface EditServicePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditServicePage({ params }: EditServicePageProps) {
  const { id } = await params;
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const [service, departments, media] = await Promise.all([
    getServiceById(id),
    listDepartments({ publishedOnly: false }),
    listMedia(),
  ]);
  if (!service) notFound();

  return (
    <AdminShell user={user} title={`Service: ${service.nameEn}`} description="Edit this service's content and media.">
      <EditServiceForm
        service={service}
        departments={departments}
        media={media.map((item) => ({ id: item.id, filename: item.filename, storageKey: item.storageKey, kind: item.kind }))}
      />
    </AdminShell>
  );
}
