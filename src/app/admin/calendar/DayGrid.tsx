import Link from "next/link";
import type { DayAppointmentRow } from "@/modules/booking/bookings";
import { AppointmentMenu } from "./AppointmentMenu";
import { NowLine } from "./NowLine";

export interface GridColumn {
  id: string;
  name: string;
  /** Approved leave today (staff columns only). */
  onLeave?: boolean;
}

interface DayGridProps {
  rows: DayAppointmentRow[];
  date: string;
  todayISO: string;
  columns: GridColumn[];
  mode: "staff" | "room";
  /** Business hours for the day, minutes from midnight; closed = null. */
  hours: { openMin: number; closeMin: number } | null;
  canManage: boolean;
  canBill: boolean;
  canClinical: boolean;
  /** Builds the walk-in prefill link for a (column, HH:MM) gap. */
  gapHref: (columnId: string, hhmm: string) => string;
}

const CENTER_TZ = "Asia/Riyadh";
const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, hour: "numeric", minute: "2-digit" });
const HOUR_PX = 64;
const CENTER_OFFSET_MS = 3 * 60 * 60 * 1000;

function minutesOfDay(d: Date): number {
  const local = new Date(d.getTime() + CENTER_OFFSET_MS);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}
const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const hourLabel = (min: number) => timeFmt.format(new Date(Date.UTC(2000, 0, 1, Math.floor(min / 60), min % 60) - CENTER_OFFSET_MS));

const STATUS_CARD: Record<string, string> = {
  REQUESTED: "border-s-[var(--color-ink)]/40 bg-[var(--surface)]",
  CONFIRMED: "border-s-[var(--color-teal)] bg-[var(--color-teal)]/[0.12]",
  CHECKED_IN: "border-s-[var(--color-gold)] bg-[var(--color-gold)]/[0.14]",
  COMPLETED: "border-s-[var(--color-canopy)] bg-[var(--color-canopy)]/[0.14]",
  CANCELLED: "border-s-red-400 bg-red-50/70 opacity-70",
  NO_SHOW: "border-s-red-400 bg-red-50/70 opacity-70",
};
export const STATUS_PILL: Record<string, string> = {
  REQUESTED: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70",
  CONFIRMED: "bg-[var(--color-teal)]/25 text-[var(--color-teal-ink)]",
  CHECKED_IN: "bg-[var(--color-gold)]/30 text-[#7c6a2f]",
  COMPLETED: "bg-[var(--color-canopy)]/30 text-[var(--color-ink)]",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-red-100 text-red-700",
};

// Time-grid day view: one column per staff member (or room), appointments
// positioned by time, a "now" line on today, and every empty hour cell a
// link that opens the walk-in form prefilled with that column + time.
export function DayGrid({ rows, date, todayISO, columns, mode, hours, canManage, canBill, canClinical, gapHref }: DayGridProps) {
  const earliest = rows.reduce((m, r) => Math.min(m, minutesOfDay(r.startAt)), hours?.openMin ?? 9 * 60);
  const latest = rows.reduce((m, r) => Math.max(m, minutesOfDay(r.endAt)), hours?.closeMin ?? 21 * 60);
  const startMin = Math.floor(earliest / 60) * 60;
  const endMin = Math.min(1440, Math.ceil(latest / 60) * 60);
  const hoursList = Array.from({ length: (endMin - startMin) / 60 }, (_, i) => startMin + i * 60);
  const height = ((endMin - startMin) / 60) * HOUR_PX;
  const isToday = date === todayISO;

  const key = mode === "staff" ? "staffUserId" : "roomId";
  const byColumn = new Map<string, DayAppointmentRow[]>(columns.map((c) => [c.id, []]));
  for (const r of rows) {
    const id = r[key];
    if (!byColumn.has(id)) byColumn.set(id, []);
    byColumn.get(id)!.push(r);
  }
  // Columns for people/rooms with no appointments still show (bookable gaps);
  // anyone with appointments but missing from `columns` (e.g. deactivated) is appended.
  const allColumns: GridColumn[] = [
    ...columns,
    ...[...byColumn.keys()].filter((id) => !columns.some((c) => c.id === id)).map((id) => ({ id, name: rows.find((r) => r[key] === id)?.[mode === "staff" ? "staffName" : "roomName"] ?? "Unknown" })),
  ];

  if (allColumns.length === 0) {
    return (
      <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-10 text-center text-sm text-[var(--color-ink)]/55">
        No {mode === "staff" ? "staff" : "rooms"} to show. Set up {mode === "staff" ? "staff schedules" : "rooms"} in Booking settings.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto lunia-card" data-testid="day-grid">
      <div className="min-w-[40rem]" style={{ gridTemplateColumns: `4.5rem repeat(${allColumns.length}, minmax(11rem, 1fr))`, display: "grid" }}>
        {/* Header row */}
        <div className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface-2)]" />
        {allColumns.map((c) => (
          <div key={c.id} className={`sticky top-0 z-20 border-b border-s border-[var(--line)] px-3 py-2 text-sm font-medium ${c.onLeave ? "bg-[var(--color-ink)]/[0.06] text-[var(--color-ink)]/55" : "bg-[var(--surface-2)] text-[var(--color-ink)]"}`}>
            <span className="flex items-center justify-between gap-2">
              <span className="truncate">{c.name}</span>
              {c.onLeave && <span className="rounded-full bg-[var(--color-ink)]/10 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide">On leave</span>}
              {!c.onLeave && <span className="text-xs text-[var(--color-ink)]/45">{byColumn.get(c.id)?.length ?? 0}</span>}
            </span>
          </div>
        ))}

        {/* Time gutter */}
        <div className="relative" style={{ height }}>
          {hoursList.map((m) => (
            <div key={m} className="absolute -translate-y-1/2 pe-2 text-end text-[0.68rem] tabular-nums text-[var(--color-ink)]/45" style={{ top: ((m - startMin) / 60) * HOUR_PX, width: "4.5rem" }}>
              {m === startMin ? "" : hourLabel(m)}
            </div>
          ))}
        </div>

        {/* Columns */}
        {allColumns.map((c) => {
          const items = byColumn.get(c.id) ?? [];
          return (
            <div key={c.id} className={`relative border-s border-[var(--line)] ${c.onLeave ? "bg-[repeating-linear-gradient(135deg,transparent,transparent_8px,color-mix(in_srgb,var(--color-ink)_6%,transparent)_8px,color-mix(in_srgb,var(--color-ink)_6%,transparent)_9px)]" : ""}`} style={{ height }} data-column-id={c.id}>
              {/* Hour cells: bookable gaps */}
              {hoursList.map((m) => {
                const closed = hours ? m < hours.openMin || m >= hours.closeMin : true;
                const past = isToday ? false : date < todayISO;
                const bookable = canManage && !closed && !past && !c.onLeave && mode === "staff";
                const cell = "absolute inset-x-0 border-t border-[var(--line)]/70";
                return bookable ? (
                  <Link
                    key={m}
                    href={gapHref(c.id, hhmm(m))}
                    aria-label={`Book ${c.name} at ${hourLabel(m)}`}
                    className={`${cell} group flex items-start justify-end p-1 transition-colors duration-150 ease-out hover:bg-[var(--color-teal)]/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-teal)]`}
                    style={{ top: ((m - startMin) / 60) * HOUR_PX, height: HOUR_PX }}
                  >
                    <span className="rounded-full bg-[var(--color-teal)] px-2 py-0.5 text-[0.62rem] font-semibold text-[var(--color-ink)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">+ Book</span>
                  </Link>
                ) : (
                  <div key={m} className={`${cell} ${closed ? "bg-[var(--color-ink)]/[0.03]" : ""}`} style={{ top: ((m - startMin) / 60) * HOUR_PX, height: HOUR_PX }} />
                );
              })}

              {/* Appointment cards */}
              {items.map((r) => {
                const top = ((minutesOfDay(r.startAt) - startMin) / 60) * HOUR_PX;
                const h = Math.max(28, ((r.endAt.getTime() - r.startAt.getTime()) / 3_600_000) * HOUR_PX);
                const compact = h < 56;
                return (
                  <div
                    key={r.appointmentId}
                    data-testid="appointment-row"
                    data-booking-id={r.bookingId}
                    data-booking-status={r.status}
                    className={`absolute inset-x-1 z-[5] flex flex-col gap-1 overflow-visible rounded-[var(--radius-sm)] border border-[var(--line)] border-s-2 p-2 text-xs shadow-[var(--shadow-sm)] ${STATUS_CARD[r.status] ?? "bg-[var(--surface)]"}`}
                    style={{ top, minHeight: h }}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--color-ink)]">
                          <Link href={`/admin/clients/${r.clientProfileId}`} className="hover:underline">
                            {r.clientName}
                          </Link>
                        </p>
                        <p className="truncate text-[var(--color-ink)]/70">
                          {timeFmt.format(r.startAt)} · {r.serviceName}
                          {!compact && ` · ${mode === "staff" ? r.roomName : r.staffName}`}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[0.58rem] font-semibold uppercase tracking-wide ${STATUS_PILL[r.status]}`}>
                        {r.startedAt && r.status === "CHECKED_IN" ? "In service" : r.status.replace("_", " ")}
                      </span>
                    </div>
                    {(r.invoice || r.treatmentRecordId) && !compact && (
                      <div className="flex flex-wrap gap-1">
                        {r.invoice && canBill && (
                          <Link href={`/admin/billing/${r.invoice.id}`} className="rounded-full bg-[var(--color-ink)]/[0.06] px-1.5 py-0.5 text-[0.6rem] text-[var(--color-ink)]/70 hover:underline">
                            {r.invoice.status === "DRAFT" ? "Draft invoice" : r.invoice.number}
                          </Link>
                        )}
                        {r.treatmentRecordId && canClinical && (
                          <Link href={`/admin/clients/${r.clientProfileId}/clinical/treatment/${r.treatmentRecordId}`} className="rounded-full bg-[var(--color-ink)]/[0.06] px-1.5 py-0.5 text-[0.6rem] text-[var(--color-ink)]/70 hover:underline">
                            Treatment record
                          </Link>
                        )}
                      </div>
                    )}
                    <AppointmentMenu
                      bookingId={r.bookingId}
                      appointmentId={r.appointmentId}
                      serviceId={r.serviceId}
                      status={r.status}
                      started={Boolean(r.startedAt)}
                      defaultDate={date}
                      clientProfileId={r.clientProfileId}
                      clientName={r.clientName}
                      invoice={r.invoice}
                      treatmentRecordId={r.treatmentRecordId}
                      canManage={canManage}
                      canBill={canBill}
                      canClinical={canClinical}
                      layout="menu"
                    />
                  </div>
                );
              })}

              {isToday && <NowLine startMin={startMin} endMin={endMin} hourPx={HOUR_PX} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
