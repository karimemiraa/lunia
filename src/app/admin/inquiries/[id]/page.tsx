import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getInquiry } from "@/modules/catalog/inquiries";
import { listStaffOwners } from "@/modules/crm/clients";
import { InquiryPanel } from "../InquiryPanel";

interface InquiryDetailPageProps {
  params: Promise<{ id: string }>;
}

const dtFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/45">{label}</dt>
      <dd className="text-sm text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}

export default async function InquiryDetailPage({ params }: InquiryDetailPageProps) {
  const { id } = await params;
  const user = await requireAdmin(PERMISSIONS.CMS_MANAGE);
  const [inquiry, staff] = await Promise.all([getInquiry(id), listStaffOwners()]);
  if (!inquiry) notFound();

  return (
    <AdminShell user={user} title={inquiry.name} description="Contact inquiry — reply, assign, and link to a customer.">
      <div className="mb-4">
        <Link href="/admin/inquiries" className="text-sm text-[var(--color-ink)]/60 hover:text-[var(--color-teal-ink)]">
          ← Back to inquiries
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-4 lunia-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${inquiry.handled ? "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]" : "bg-[var(--color-gold)]/25 text-[#7c6a2f]"}`}>
            {inquiry.handled ? "Handled" : "New"}
          </span>
          {inquiry.repliedAt && <span className="rounded-full bg-[var(--color-teal)]/20 px-2.5 py-0.5 text-xs font-medium text-[var(--color-teal-ink)]">Replied</span>}
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Phone" value={inquiry.phone} />
          <Detail label="Email" value={inquiry.email || "None"} />
          <Detail label="Source page" value={inquiry.sourcePage || "None"} />
          <Detail label="Received" value={dtFmt.format(inquiry.createdAt)} />
        </dl>
        <div>
          <dt className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/45">Message</dt>
          <dd className="mt-1 whitespace-pre-wrap rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface-2)]/40 px-3 py-2 text-sm text-[var(--color-ink)]/85">
            {inquiry.message}
          </dd>
        </div>
      </div>

      <InquiryPanel
        id={inquiry.id}
        email={inquiry.email}
        assignedToId={inquiry.assignedToId}
        clientProfileId={inquiry.clientProfileId}
        repliedAtIso={inquiry.repliedAt ? inquiry.repliedAt.toISOString() : null}
        replyBody={inquiry.replyBody}
        staff={staff}
      />
    </AdminShell>
  );
}
