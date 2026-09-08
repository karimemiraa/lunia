import { notFound } from "next/navigation";
import { requireAdmin } from "../../../_components/requireAdmin";
import { AdminShell } from "../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getBrandById } from "@/modules/catalog/brands";
import { listMedia } from "@/modules/cms/media";
import { EditBrandForm } from "./EditBrandForm";

interface EditBrandPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditBrandPage({ params }: EditBrandPageProps) {
  const { id } = await params;
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);

  const [brand, media] = await Promise.all([getBrandById(id), listMedia()]);
  if (!brand) notFound();

  return (
    <AdminShell user={user} title={`Brand: ${brand.name}`} description="Edit this brand's content and media.">
      <EditBrandForm
        brand={brand}
        media={media.map((item) => ({ id: item.id, filename: item.filename, storageKey: item.storageKey, kind: item.kind }))}
      />
    </AdminShell>
  );
}
