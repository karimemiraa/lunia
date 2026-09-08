import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listBrands } from "@/modules/catalog/brands";
import { listMedia } from "@/modules/cms/media";
import { CreateBrandForm } from "./CreateBrandForm";
import { BrandsTable } from "./BrandsTable";

export default async function BrandsPage() {
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const [brands, media] = await Promise.all([listBrands({ publishedOnly: false }), listMedia()]);

  return (
    <AdminShell user={user} title="Brands" description="Manage partner and product brands featured on the site.">
      <div className="mb-8 max-w-2xl">
        <CreateBrandForm
          media={media.map((item) => ({ id: item.id, filename: item.filename, storageKey: item.storageKey, kind: item.kind }))}
        />
      </div>
      <BrandsTable brands={brands} />
    </AdminShell>
  );
}
