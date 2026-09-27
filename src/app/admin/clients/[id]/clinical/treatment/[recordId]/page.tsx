import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../../../../_components/requireAdmin";
import { AdminShell } from "../../../../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { prisma } from "@/lib/db";
import { getTreatmentRecord } from "@/modules/clinical/treatments";
import { utcToCenterLocal } from "@/modules/booking/availability";
import { loadClient } from "../../_components/loadClient";
import { loadTreatmentOptions, toLocalInput } from "../../_components/treatmentOptions";
import { TreatmentForm } from "../../_components/TreatmentForm";

interface Props {
  params: Promise<{ id: string; recordId: string }>;
  searchParams: Promise<{ saved?: string }>;
}

const dtFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });

export default async function EditTreatmentPage({ params, searchParams }: Props) {
  const [{ id, recordId }, { saved }] = await Promise.all([params, searchParams]);
  const user = await requireAdmin(PERMISSIONS.CLINICAL_MANAGE);
  const client = await loadClient(id);
  const record = await getTreatmentRecord(recordId);
  if (!record || record.clientProfileId !== id) notFound();

  const [options, appt, photos] = await Promise.all([
    loadTreatmentOptions(),
    record.appointmentId ? prisma.appointment.findUnique({ where: { id: record.appointmentId }, select: { startAt: true, service: { select: { nameEn: true } } } }) : null,
    prisma.clinicalPhoto.findMany({ where: { treatmentRecordId: recordId }, orderBy: { takenAt: "asc" }, select: { id: true, kind: true, area: true } }),
  ]);
  // Keep a since-deactivated specialist selectable on their own old record.
  const staff = options.staff.some((s) => s.id === record.performedById)
    ? options.staff
    : [...options.staff, { id: record.performedById, label: record.performedByName }];

  return (
    <AdminShell
      user={user}
      title={record.serviceName ?? "Treatment record"}
      description={`${client.displayName} · ${dtFmt.format(record.performedAt)}`}
      actions={
        <Link href={`/admin/clients/${id}`} className="lunia-btn lunia-btn-ghost min-h-11">
          Back to customer
        </Link>
      }
    >
      <div className="flex flex-col gap-6">
        {saved && <p role="status" className="rounded-[var(--radius-sm)] bg-[var(--color-teal)]/15 px-4 py-2.5 text-sm text-[var(--color-ink)]">Saved.</p>}
        <div className="lunia-card p-5 sm:p-8">
          <TreatmentForm
            clientProfileId={id}
            recordId={record.id}
            appointmentLabel={appt ? `${appt.service.nameEn}, ${dtFmt.format(appt.startAt)}` : null}
            initial={{
              appointmentId: record.appointmentId,
              serviceId: record.serviceId ?? "",
              performedById: record.performedById,
              performedAtLocal: toLocalInput(record.performedAt),
              settings: record.settings,
              productsUsed: record.productsUsed.map((p) => ({ productId: p.productId ?? null, name: p.name, qty: p.qty ?? "", unit: p.unit ?? "" })),
              notes: record.notes ?? "",
              skinReaction: record.skinReaction ?? "",
              followUpDate: record.followUpAt ? utcToCenterLocal(record.followUpAt).dateISO : "",
            }}
            services={options.services}
            staff={staff}
            products={options.products}
          />
        </div>
        <section className="lunia-card flex flex-col gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Photos for this session</h2>
            <Link href={`/admin/clients/${id}/clinical/photos?record=${record.id}`} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11">
              Add photos
            </Link>
          </div>
          {photos.length === 0 ? (
            <p className="text-sm text-[var(--color-ink)]/55">No photos linked to this session.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {photos.map((p) => (
                <li key={p.id} className="relative overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-2)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated route */}
                  <img src={`/admin/clinical/photo/${p.id}`} alt={`${p.kind} ${p.area ?? ""}`} className="aspect-square w-full object-cover" />
                  <span className="absolute start-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-white">{p.kind}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
