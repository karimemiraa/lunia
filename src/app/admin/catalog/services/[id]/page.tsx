import { notFound } from "next/navigation";
import { requireAdmin } from "../../../_components/requireAdmin";
import { AdminShell } from "../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getServiceById } from "@/modules/catalog/services";
import { listDepartments } from "@/modules/catalog/departments";
import { listMedia } from "@/modules/cms/media";
import { listTiers } from "@/modules/iam/tiers";
import { getMinTierForService } from "@/modules/booking/accessRules";
import { EditServiceForm } from "./EditServiceForm";

interface EditServicePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditServicePage({ params }: EditServicePageProps) {
  const { id } = await params;
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const [service, departments, media, tiers, minTier] = await Promise.all([
    getServiceById(id),
    listDepartments({ publishedOnly: false }),
    listMedia(),
    listTiers(),
    getMinTierForService(id),
  ]);
  if (!service) notFound();

  return (
    <AdminShell user={user} title={`Service: ${service.nameEn}`} description="Edit this service's content, media, and booking settings.">
      <EditServiceForm
        service={service}
        departments={departments}
        media={media.map((item) => ({ id: item.id, filename: item.filename, storageKey: item.storageKey, kind: item.kind }))}
        tiers={tiers}
        currentMinTierId={minTier?.minTierId ?? null}
      />
    </AdminShell>
  );
}
