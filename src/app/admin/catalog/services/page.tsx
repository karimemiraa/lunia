import type { Department } from "@prisma/client";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listServices } from "@/modules/catalog/services";
import { listDepartments } from "@/modules/catalog/departments";
import { listMedia } from "@/modules/cms/media";
import { CreateServiceForm } from "./CreateServiceForm";
import { ServicesTable } from "./ServicesTable";

export default async function ServicesPage() {
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const [services, departments, media] = await Promise.all([
    listServices(undefined, { publishedOnly: false }),
    listDepartments({ publishedOnly: false }),
    listMedia(),
  ]);

  const departmentsById = Object.fromEntries(departments.map((d: Department) => [d.id, d]));

  return (
    <AdminShell user={user} title="Services" description="Manage services, grouped under a department.">
      <div className="mb-8 max-w-2xl">
        <CreateServiceForm
          departments={departments}
          media={media.map((item) => ({ id: item.id, filename: item.filename, storageKey: item.storageKey, kind: item.kind }))}
        />
      </div>
      <ServicesTable services={services} departmentsById={departmentsById} />
    </AdminShell>
  );
}
