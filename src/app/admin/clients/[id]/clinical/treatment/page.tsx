import Link from "next/link";
import { requireAdmin } from "../../../../_components/requireAdmin";
import { AdminShell } from "../../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { prisma } from "@/lib/db";
import { getAppointmentForTreatment } from "@/modules/clinical/treatments";
import { loadClient } from "../_components/loadClient";
import { loadTreatmentOptions, toLocalInput } from "../_components/treatmentOptions";
import { TreatmentForm } from "../_components/TreatmentForm";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ appointmentId?: string }>;
}

const dtFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });

// New treatment record: ad hoc, or started from an appointment (calendar /
// customer page) which pre-fills service, specialist and time. An appointment
// that already has a record redirects to it.
export default async function NewTreatmentPage({ params, searchParams }: Props) {
  const [{ id }, { appointmentId }] = await Promise.all([params, searchParams]);
  const user = await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  const client = await loadClient(id);
  const options = await loadTreatmentOptions();

  const appt = appointmentId ? await getAppointmentForTreatment(appointmentId) : null;
  const linked = appt && appt.booking.clientProfileId === id ? appt : null;
  const existing = linked ? await prisma.treatmentRecord.findUnique({ where: { appointmentId: linked.id }, select: { id: true } }) : null;
  const serviceName = linked ? options.services.find((s) => s.id === linked.serviceId)?.label : null;

  return (
    <AdminShell
      user={user}
      title="New treatment record"
      description={client.displayName}
      actions={
        <Link href={`/admin/clients/${id}`} className="lunia-btn lunia-btn-ghost min-h-11">
          Back to customer
        </Link>
      }
    >
      {existing ? (
        <div className="lunia-card flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
          This appointment already has a treatment record.
          <Link href={`/admin/clients/${id}/clinical/treatment/${existing.id}`} className="lunia-btn lunia-btn-forest lunia-btn-sm min-h-11">
            Open it
          </Link>
        </div>
      ) : (
        <div className="lunia-card p-5 sm:p-8">
          <TreatmentForm
            clientProfileId={id}
            recordId={null}
            appointmentLabel={linked ? `${serviceName ?? "Appointment"}, ${dtFmt.format(linked.startAt)}` : null}
            initial={{
              appointmentId: linked?.id ?? null,
              serviceId: linked?.serviceId ?? "",
              performedById: linked?.staffUserId ?? (options.staff.some((s) => s.id === user.id) ? user.id : (options.staff[0]?.id ?? "")),
              performedAtLocal: toLocalInput(linked?.startAt ?? new Date()),
              settings: [{ key: "Device", value: "" }],
              productsUsed: [],
              notes: "",
              skinReaction: "",
              followUpDate: "",
            }}
            {...options}
          />
        </div>
      )}
    </AdminShell>
  );
}
