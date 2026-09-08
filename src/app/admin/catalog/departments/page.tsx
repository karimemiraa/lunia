import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listDepartments } from "@/modules/catalog/departments";
import { listMedia } from "@/modules/cms/media";
import { CreateDepartmentForm } from "./CreateDepartmentForm";
import { DepartmentsTable } from "./DepartmentsTable";

export default async function DepartmentsPage() {
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const [departments, media] = await Promise.all([
    listDepartments({ publishedOnly: false }),
    listMedia(),
  ]);

  return (
    <AdminShell user={user} title="Departments" description="Manage service departments shown on the public site.">
      <div className="mb-8 max-w-2xl">
        <CreateDepartmentForm
          media={media.map((item) => ({ id: item.id, filename: item.filename, storageKey: item.storageKey, kind: item.kind }))}
        />
      </div>
      <DepartmentsTable departments={departments} />
    </AdminShell>
  );
}
