import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { listWaitlist } from "@/modules/booking/waitlist";
import { getFrontDeskServices } from "@/modules/booking/serviceSettings";
import { utcToCenterLocal } from "@/modules/booking/availability";
import { WaitlistAddForm, type WaitlistServiceDTO } from "./WaitlistAddForm";
import { WaitlistTable, type WaitlistRowDTO } from "./WaitlistTable";

interface WaitlistPageProps {
  searchParams: Promise<{ status?: string }>;
}

const STATUS_VALUES = ["WAITING", "NOTIFIED", "CONVERTED", "EXPIRED"] as const;
type StatusFilter = (typeof STATUS_VALUES)[number];

function isStatusFilter(value: string | undefined): value is StatusFilter {
  return !!value && (STATUS_VALUES as readonly string[]).includes(value);
}

export default async function WaitlistPage({ searchParams }: WaitlistPageProps) {
  const user = await requireAdmin(PERMISSIONS.BOOKING_VIEW);
  const canManage = user.permissions.has(PERMISSIONS.BOOKING_MANAGE);

  const params = await searchParams;
  const statusFilter = isStatusFilter(params.status) ? params.status : undefined;
  const todayISO = utcToCenterLocal(new Date()).dateISO;

  const [entries, frontDeskServices] = await Promise.all([
    listWaitlist(statusFilter ? { status: statusFilter } : {}),
    canManage ? getFrontDeskServices() : Promise.resolve([]),
  ]);

  const rows: WaitlistRowDTO[] = entries.map((entry) => {
    const contactName = entry.clientProfile?.fullName ?? entry.name ?? "Unknown";
    const contactDetail = entry.clientProfile
      ? entry.clientProfile.user.phone ?? entry.clientProfile.user.email ?? null
      : entry.phone ?? entry.email ?? null;
    return {
      id: entry.id,
      serviceId: entry.serviceId,
      serviceName: entry.service.nameEn,
      desiredDateISO: entry.desiredDateISO,
      desiredWindow: entry.desiredWindow,
      contactName,
      contactDetail,
      status: entry.status,
      createdAtIso: entry.createdAt.toISOString(),
      notifiedAtIso: entry.notifiedAt ? entry.notifiedAt.toISOString() : null,
    };
  });

  const waitlistServices: WaitlistServiceDTO[] = frontDeskServices.map((service) => ({
    id: service.id,
    name: service.nameEn,
    departmentName: service.department.nameEn,
  }));

  return (
    <AdminShell
      user={user}
      title="Waitlist"
      description="Customers waiting for a service+day to open up, notified automatically the moment a slot frees."
    >
      <div className="mb-6 flex flex-wrap gap-2">
        {(["", ...STATUS_VALUES] as const).map((status) => {
          const isActive = status === "" ? !statusFilter : statusFilter === status;
          return (
            <a
              key={status || "all"}
              href={status ? `/admin/waitlist?status=${status}` : "/admin/waitlist"}
              className={`rounded-full px-3 py-1.5 text-xs font-medium uppercase tracking-wide transition-colors ${
                isActive
                  ? "bg-[var(--color-teal)] text-[var(--color-ink)]"
                  : "border border-[var(--color-ink)]/20 text-[var(--color-ink)]/70 hover:bg-[var(--color-ink)]/5"
              }`}
            >
              {status || "All"}
            </a>
          );
        })}
      </div>

      {canManage && (
        <div className="mb-8 max-w-3xl">
          <WaitlistAddForm services={waitlistServices} defaultDate={todayISO} />
        </div>
      )}

      <WaitlistTable rows={rows} canManage={canManage} />
    </AdminShell>
  );
}
