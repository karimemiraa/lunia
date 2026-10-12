import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getAppointmentHub } from "@/modules/booking/appointmentHub";
import { formatSarMinor } from "@/modules/billing/money";
import { AppointmentMenu } from "../AppointmentMenu";
import { HubComments } from "./HubComments";
import { HubDocuments } from "./HubDocuments";

interface HubPageProps {
  params: Promise<{ appointmentId: string }>;
}

const CENTER_TZ = "Asia/Riyadh";
const dtFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "full", timeStyle: "short" });
const tFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, hour: "numeric", minute: "2-digit" });
const dFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "medium" });
const dtShort = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "medium", timeStyle: "short" });
const dateISOFor = (d: Date) => new Date(d.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70",
  CONFIRMED: "bg-[var(--color-teal)]/20 text-[var(--color-ink)]",
  CHECKED_IN: "bg-[var(--color-gold)]/25 text-[var(--color-ink)]",
  COMPLETED: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-red-100 text-red-700",
};

const INVOICE_STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70",
  ISSUED: "bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]",
  PARTIALLY_PAID: "bg-[var(--color-gold)]/25 text-[#7c6a2f]",
  PAID: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
  VOID: "bg-red-100 text-red-700",
};

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="lunia-card flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/50">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-[var(--color-ink)]">{children}</dd>
    </div>
  );
}

function Stat({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/50">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-xl leading-tight text-[var(--color-ink)]">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-[var(--color-ink)]/45">{hint}</p>}
    </>
  );
  const cls = "lunia-card block min-w-0 px-4 py-3";
  return href ? (
    <Link href={href} className={`${cls} transition-colors duration-200 ease-out hover:bg-[var(--surface-2)]`}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const chip = "inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium";

export default async function AppointmentHubPage({ params }: HubPageProps) {
  const { appointmentId } = await params;
  const user = await requireAdmin(PERMISSIONS.BOOKING_VIEW);
  const canManageBooking = user.permissions.has(PERMISSIONS.BOOKING_MANAGE);
  const canBill = user.permissions.has(PERMISSIONS.BILLING_MANAGE);
  const canClinical = user.permissions.has(PERMISSIONS.CLINICAL_MANAGE);
  const canWriteNotes = user.permissions.has(PERMISSIONS.VISITNOTE_WRITE);
  const canManageClient = user.permissions.has(PERMISSIONS.CLIENT_MANAGE);
  const canViewClient = user.permissions.has(PERMISSIONS.CLIENT_VIEW);

  const hub = await getAppointmentHub(appointmentId);
  if (!hub) notFound();

  const { booking, appointment, client, invoice, treatmentRecord, siblings, photos, documents, comments, history, stats, checkIn } = hub;
  const started = Boolean(checkIn?.seatedAt);
  const clientHref = `/admin/clients/${client.id}`;

  return (
    <AdminShell
      user={user}
      title={appointment.serviceName}
      description={`${dtFmt.format(appointment.startAt)} · ${client.fullName}`}
      actions={
        <Link href={`/admin/calendar?day=${dateISOFor(appointment.startAt)}`} className="lunia-btn lunia-btn-ghost min-h-11">
          ← Calendar
        </Link>
      }
    >
      <div className="flex flex-col gap-6">
        {/* Status + lifecycle actions */}
        <div className="lunia-card flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_STYLES[booking.status] ?? "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70"}`}>
              {booking.status.replace("_", " ")}
            </span>
            <span className="text-sm text-[var(--color-ink)]/70">
              {tFmt.format(appointment.startAt)}–{tFmt.format(appointment.endAt)} · {appointment.durationMin} min
            </span>
            <span className="text-sm font-medium text-[var(--color-ink)]">{formatSarMinor(appointment.priceMinor)}</span>
            <span className="text-xs text-[var(--color-ink)]/45">Booked {dFmt.format(booking.createdAt)} · {booking.channel.replace("_", " ").toLowerCase()}</span>
          </div>
          <AppointmentMenu
            bookingId={booking.id}
            appointmentId={appointmentId}
            serviceId={appointment.serviceId}
            status={booking.status}
            started={started}
            defaultDate={dateISOFor(appointment.startAt)}
            clientProfileId={client.id}
            clientName={client.fullName}
            invoice={invoice ? { id: invoice.id, number: invoice.number, status: invoice.status } : null}
            treatmentRecordId={treatmentRecord?.id ?? null}
            canManage={canManageBooking}
            canBill={canBill}
            canClinical={canClinical}
            layout="inline"
            hubLink={false}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          {/* Main column */}
          <div className="flex flex-col gap-6">
            {/* Visit details */}
            <Card title="Visit">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Service">{appointment.serviceName}</Field>
                <Field label="Specialist">{appointment.staffName}</Field>
                <Field label="Room">{appointment.roomName}</Field>
                <Field label="Arrived">{checkIn ? dtShort.format(checkIn.arrivedAt) : "—"}</Field>
                <Field label="In room">{checkIn?.seatedAt ? dtShort.format(checkIn.seatedAt) : "—"}</Field>
                <Field label="Source">{booking.sourceChannel ?? booking.channel.replace("_", " ").toLowerCase()}</Field>
              </dl>
              {(booking.centerNote || booking.customerNote || booking.notes) && (
                <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-3 text-sm">
                  {booking.customerNote && <p><span className="font-medium text-[var(--color-ink)]/70">From customer:</span> <span className="text-[var(--color-ink)]/80">{booking.customerNote}</span></p>}
                  {booking.centerNote && <p><span className="font-medium text-[var(--color-ink)]/70">To customer:</span> <span className="text-[var(--color-ink)]/80">{booking.centerNote}</span></p>}
                  {booking.notes && <p><span className="font-medium text-[var(--color-ink)]/70">Admin note:</span> <span className="text-[var(--color-ink)]/80">{booking.notes}</span></p>}
                </div>
              )}
              {siblings.length > 1 && (
                <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-3">
                  <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/50">Also in this visit</p>
                  <ul className="flex flex-col gap-1.5">
                    {siblings.filter((s) => !s.isCurrent).map((s) => (
                      <li key={s.appointmentId}>
                        <Link href={`/admin/calendar/${s.appointmentId}`} className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:bg-[var(--surface-2)]">
                          <span className="text-[var(--color-ink)]">{s.serviceName}</span>
                          <span className="text-xs text-[var(--color-ink)]/55">{tFmt.format(s.startAt)} · {s.staffName}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            {/* Rechnung (invoice) + what they bought */}
            {canBill && (
              <Card
                title="Invoice (Rechnung)"
                action={
                  invoice ? (
                    <Link href={`/admin/billing/${invoice.id}`} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-9">Open invoice</Link>
                  ) : booking.status !== "CANCELLED" && booking.status !== "NO_SHOW" ? (
                    <Link href={`/admin/billing/new?booking=${booking.id}`} className="lunia-btn lunia-btn-forest lunia-btn-sm min-h-9">Create invoice</Link>
                  ) : undefined
                }
              >
                {invoice ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-[var(--color-ink)]">{invoice.status === "DRAFT" ? "Draft" : invoice.number}</span>
                      <span className={`${chip} ${INVOICE_STATUS_STYLES[invoice.status] ?? "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70"}`}>{invoice.status.replace("_", " ")}</span>
                      {invoice.outstandingMinor > 0 && <span className={`${chip} bg-[var(--color-gold)]/20 text-[#7c6a2f]`}>{formatSarMinor(invoice.outstandingMinor)} due</span>}
                    </div>
                    <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--line)]">
                      <table className="w-full text-start text-sm">
                        <thead className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
                          <tr>
                            <th className="px-3 py-2 text-start font-semibold">What they bought</th>
                            <th className="px-3 py-2 text-end font-semibold">Qty</th>
                            <th className="px-3 py-2 text-end font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoice.lines.map((l, i) => (
                            <tr key={i} className="border-b border-[var(--line)] last:border-0">
                              <td className="px-3 py-2 text-[var(--color-ink)]">{l.description}<span className="ms-2 text-[11px] uppercase tracking-wide text-[var(--color-ink)]/40">{l.kind.toLowerCase()}</span></td>
                              <td className="px-3 py-2 text-end tabular-nums">{l.qty}</td>
                              <td className="px-3 py-2 text-end tabular-nums">{formatSarMinor(l.totalMinor)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-col gap-1 self-end text-sm sm:w-56">
                      <div className="flex justify-between text-[var(--color-ink)]/70"><span>Subtotal</span><span className="tabular-nums">{formatSarMinor(invoice.subtotalMinor)}</span></div>
                      {invoice.discountMinor > 0 && <div className="flex justify-between text-[var(--color-ink)]/70"><span>Discount</span><span className="tabular-nums">−{formatSarMinor(invoice.discountMinor)}</span></div>}
                      <div className="flex justify-between text-[var(--color-ink)]/70"><span>VAT</span><span className="tabular-nums">{formatSarMinor(invoice.vatMinor)}</span></div>
                      <div className="flex justify-between border-t border-[var(--line)] pt-1 font-medium text-[var(--color-ink)]"><span>Total</span><span className="tabular-nums">{formatSarMinor(invoice.totalMinor)}</span></div>
                      <div className="flex justify-between text-[var(--color-ink)]/70"><span>Paid</span><span className="tabular-nums">{formatSarMinor(invoice.paidMinor)}</span></div>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">No invoice for this visit yet.</p>
                )}
              </Card>
            )}

            {/* Treatment record */}
            {canClinical && (
              <Card
                title="Treatment record"
                action={
                  <Link
                    href={treatmentRecord ? `${clientHref}/clinical/treatment/${treatmentRecord.id}` : `${clientHref}/clinical/treatment?appointmentId=${appointmentId}`}
                    className="lunia-btn lunia-btn-forest-outline lunia-btn-sm min-h-9"
                  >
                    {treatmentRecord ? "Open record" : "Add record"}
                  </Link>
                }
              >
                {treatmentRecord ? (
                  <div className="flex flex-col gap-3 text-sm">
                    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                      <Field label="Performed by">{treatmentRecord.performedByName}</Field>
                      <Field label="When">{dtShort.format(treatmentRecord.performedAt)}</Field>
                      {treatmentRecord.followUpAt && <Field label="Follow-up">{dFmt.format(treatmentRecord.followUpAt)}</Field>}
                    </dl>
                    {treatmentRecord.products.length > 0 && (
                      <p className="text-[var(--color-ink)]/80"><span className="font-medium text-[var(--color-ink)]/70">Products used:</span> {treatmentRecord.products.map((p) => `${p.name}${p.qty ? ` (${p.qty}${p.unit})` : ""}`).join(", ")}</p>
                    )}
                    {treatmentRecord.notes && <p className="whitespace-pre-wrap text-[var(--color-ink)]/80">{treatmentRecord.notes}</p>}
                    {treatmentRecord.skinReaction && <p className="text-[var(--color-ink)]/80"><span className="font-medium text-[var(--color-ink)]/70">Reaction:</span> {treatmentRecord.skinReaction}</p>}
                  </div>
                ) : (
                  <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">No treatment record for this appointment yet.</p>
                )}
              </Card>
            )}

            {/* Documents (files) + clinical photos */}
            <Card title="Documents" action={canClinical ? <Link href={`${clientHref}?tab=patient`} className="text-xs text-[var(--color-teal-ink)] hover:underline">Patient file</Link> : undefined}>
              <HubDocuments
                appointmentId={appointmentId}
                bookingId={booking.id}
                clientProfileId={client.id}
                documents={documents}
                canManage={canManageBooking}
              />
              {canClinical && photos.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-4">
                  <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/50">Clinical photos</p>
                  <ul className="flex flex-wrap gap-2">
                    {photos.map((p) => (
                      <li key={p.id}>
                        <a href={`/admin/clinical/photo/${p.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] px-3 py-2 text-sm text-[var(--color-ink)] transition-colors hover:bg-[var(--surface-2)]">
                          <span className={`${chip} bg-[var(--color-teal)]/15 text-[var(--color-teal-ink)]`}>{p.kind.toLowerCase()}</span>
                          <span className="text-[var(--color-ink)]/70">{p.area || dFmt.format(p.takenAt)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            {/* Comments (visit-scoped) */}
            <Card title="Comments">
              <HubComments
                appointmentId={appointmentId}
                bookingId={booking.id}
                clientProfileId={client.id}
                comments={comments}
                currentUserId={user.id}
                canWrite={canWriteNotes}
                canManage={canManageClient}
              />
            </Card>
          </div>

          {/* Aside */}
          <aside className="flex flex-col gap-6">
            {/* Customer */}
            <Card title="Customer" action={canViewClient ? <Link href={clientHref} className="text-xs text-[var(--color-teal-ink)] hover:underline">Open 360</Link> : undefined}>
              <div className="flex flex-col gap-2.5">
                <p className="font-[family-name:var(--font-display)] text-lg text-[var(--color-ink)]">{client.fullName}</p>
                <div className="flex flex-col gap-1 text-sm">
                  {client.phone && <a href={`tel:${client.phone}`} dir="ltr" className="text-[var(--color-teal-ink)] hover:underline">{client.phone}</a>}
                  {client.email && <a href={`mailto:${client.email}`} className="text-[var(--color-ink)]/70 hover:underline">{client.email}</a>}
                  {!client.phone && !client.email && <span className="text-[var(--color-ink)]/55">No contact on file</span>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {client.tierName && <span className={`${chip} bg-[var(--color-ink)]/8 text-[var(--color-ink)]/70`}>{client.tierName}</span>}
                  <span className={`${chip} ${client.consentTreatmentAt ? "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]" : "bg-[var(--color-gold)]/25 text-[#7c6a2f]"}`}>
                    Treatment consent {client.consentTreatmentAt ? "✓" : "missing"}
                  </span>
                  {client.allergies && <span className={`${chip} bg-red-100 text-red-800`} title={client.allergies}>Allergies: {client.allergies.length > 32 ? `${client.allergies.slice(0, 31)}…` : client.allergies}</span>}
                  {client.tags.map((t) => <span key={t} className={`${chip} bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]`}>{t}</span>)}
                </div>
              </div>
            </Card>

            {/* Quick stats */}
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Lifetime value" value={formatSarMinor(client.ltvMinor)} />
              <Stat label="Visits" value={String(stats.completedVisits)} hint={`${stats.totalBookings} bookings`} href={canViewClient ? `${clientHref}?tab=appointments` : undefined} />
              <Stat label="Last visit" value={stats.lastVisitAt ? dFmt.format(stats.lastVisitAt) : "First"} />
              <Stat label="Skin type" value={client.skinType || "—"} />
            </div>

            {/* Visit history */}
            <Card title="Visit history">
              {history.length <= 1 ? (
                <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-5 text-center text-sm text-[var(--color-ink)]/55">No other visits yet.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {history.map((h) => (
                    <li key={h.bookingId}>
                      {h.isCurrent ? (
                        <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-[var(--color-teal)]/10 px-3 py-2 text-sm">
                          <span className="truncate font-medium text-[var(--color-ink)]">{h.serviceName}</span>
                          <span className="shrink-0 text-xs text-[var(--color-ink)]/55">This visit</span>
                        </div>
                      ) : (
                        <Link href={`/admin/calendar/${h.appointmentId}`} className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-sm hover:bg-[var(--surface-2)]">
                          <span className="truncate text-[var(--color-ink)]">{h.serviceName}</span>
                          <span className="shrink-0 text-xs text-[var(--color-ink)]/55">{dFmt.format(h.startAt)}</span>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </aside>
        </div>
      </div>
    </AdminShell>
  );
}
