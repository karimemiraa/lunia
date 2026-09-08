import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listInquiries } from "@/modules/catalog/inquiries";
import { InquiriesTable } from "./InquiriesTable";

export default async function InquiriesPage() {
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const inquiries = await listInquiries();

  return (
    <AdminShell user={user} title="Inquiries" description="Contact form submissions from the public site, newest first.">
      <InquiriesTable inquiries={inquiries} />
    </AdminShell>
  );
}
