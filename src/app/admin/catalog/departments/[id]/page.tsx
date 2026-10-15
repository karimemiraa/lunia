import { notFound } from "next/navigation";
import { requireAdmin } from "../../../_components/requireAdmin";
import { AdminShell } from "../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getStaffT, getStaffLocale } from "../../../_i18n/display";
import { getDepartmentById } from "@/modules/catalog/departments";
import { listMedia } from "@/modules/cms/media";
import { EditDepartmentForm } from "./EditDepartmentForm";

interface EditDepartmentPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditDepartmentPage({ params }: EditDepartmentPageProps) {
  const { id } = await params;
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const t = await getStaffT();
  const locale = await getStaffLocale();

  const [department, media] = await Promise.all([getDepartmentById(id), listMedia()]);
  if (!department) notFound();

  return (
    <AdminShell user={user} title={t("Department: {name}", { name: locale === "ar" && department.nameAr ? department.nameAr : department.nameEn })} description="Edit this department's content and media.">
      <EditDepartmentForm
        department={department}
        media={media.map((item) => ({ id: item.id, filename: item.filename, storageKey: item.storageKey, kind: item.kind }))}
      />
    </AdminShell>
  );
}
