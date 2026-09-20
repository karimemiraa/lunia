import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listPipeline, listLeadSources } from "@/modules/crm/leads";
import { listStages } from "@/modules/crm/pipeline";
import type { LeadDirection } from "@prisma/client";
import { LeadBoard } from "./LeadBoard";

interface LeadsPageProps {
  searchParams: Promise<{ direction?: string; source?: string }>;
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const user = await requireAdmin(PERMISSIONS.CLIENT_VIEW);
  const canManage = user.permissions.has(PERMISSIONS.CLIENT_MANAGE);
  const { direction, source } = await searchParams;

  const dir = direction === "INBOUND" || direction === "OUTBOUND" ? (direction as LeadDirection) : undefined;
  const [{ columns, counts }, sources, stageRows] = await Promise.all([
    listPipeline({ direction: dir, source: source || undefined }),
    listLeadSources(),
    listStages(),
  ]);

  const stages = stageRows.map((s) => ({ key: s.key, label: s.label, color: s.color }));
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm transition-colors ${active ? "bg-[var(--color-forest)] text-[var(--color-cream)]" : "border border-[var(--line)] text-[var(--color-ink)]/70 hover:bg-[var(--color-ink)]/[0.04]"}`;
  const qs = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const d = next.direction ?? direction;
    const s = next.source ?? source;
    if (d) p.set("direction", d);
    if (s) p.set("source", s);
    const str = p.toString();
    return str ? `/admin/leads?${str}` : "/admin/leads";
  };

  return (
    <AdminShell
      user={user}
      title="Leads"
      description="Every enquiry in one pipeline — from WhatsApp, the website, walk-ins, referrals, and more. Drag a lead between stages, or use its menu to move it. Stages are editable in the Superadmin panel."
      actions={
        canManage ? (
          <Link href="/admin/clients" className="lunia-btn lunia-btn-forest-outline lunia-btn-sm">
            All customers
          </Link>
        ) : undefined
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink)]/45">Direction</span>
          <Link href={qs({ direction: undefined })} className={chip(!direction)}>All</Link>
          <Link href={qs({ direction: "INBOUND" })} className={chip(direction === "INBOUND")}>Inbound</Link>
          <Link href={qs({ direction: "OUTBOUND" })} className={chip(direction === "OUTBOUND")}>Outbound</Link>
        </div>
        {sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-ink)]/45">Channel</span>
            <Link href={qs({ source: undefined })} className={chip(!source)}>All</Link>
            {sources.map((s) => (
              <Link key={s} href={qs({ source: s })} className={chip(source === s)}>{s}</Link>
            ))}
          </div>
        )}
      </div>

      <LeadBoard stages={stages} columns={columns} counts={counts} />
    </AdminShell>
  );
}
