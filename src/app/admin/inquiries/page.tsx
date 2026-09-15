import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listInquiries } from "@/modules/catalog/inquiries";
import { InquiriesTable } from "./InquiriesTable";

export default async function InquiriesPage() {
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const inquiries = await listInquiries();

  const unhandled = inquiries.filter((i) => !i.handled).length;
  const bannerLine =
    unhandled === 0
      ? "All inquiries have been handled."
      : `${unhandled} inquir${unhandled === 1 ? "y" : "ies"} awaiting a reply.`;

  return (
    <AdminShell user={user} title="Inquiries" description="Contact form submissions from the public site, newest first.">
      <div className="mb-6 flex items-center justify-between gap-4 rounded-[var(--radius-lg)] bg-[var(--color-forest)] px-6 py-5 text-[var(--color-cream)] shadow-[var(--shadow-sm)]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-teal)]">Inbox</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl">{bannerLine}</p>
        </div>
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--color-cream)]/10 text-2xl font-medium">
          {unhandled}
        </span>
      </div>
      <InquiriesTable inquiries={inquiries} />
    </AdminShell>
  );
}
