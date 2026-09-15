"use client";

import { useTransition } from "react";
import { notifyWaitlistNowAction } from "./actions";

export interface WaitlistRowDTO {
  id: string;
  serviceName: string;
  desiredDateISO: string;
  desiredWindow: string | null;
  contactName: string;
  contactDetail: string | null;
  status: "WAITING" | "NOTIFIED" | "CONVERTED" | "EXPIRED";
  createdAtIso: string;
  notifiedAtIso: string | null;
  serviceId: string;
}

interface WaitlistTableProps {
  rows: WaitlistRowDTO[];
  canManage: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  WAITING: "bg-[var(--color-gold)]/25 text-[var(--color-ink)]",
  NOTIFIED: "bg-[var(--color-teal)]/20 text-[var(--color-ink)]",
  CONVERTED: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
  EXPIRED: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/60",
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(`${iso}T00:00:00Z`));
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function NotifyNowButton({ serviceId, desiredDateISO }: { serviceId: string; desiredDateISO: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await notifyWaitlistNowAction(serviceId, desiredDateISO);
        })
      }
      className="lunia-btn lunia-btn-ghost lunia-btn-sm disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? "Notifying…" : "Notify now"}
    </button>
  );
}

// Read-only waitlist table (plus a per-row "Notify now" manual trigger for
// BOOKING_MANAGE staff) -- the same notify-on-free path cancel()/
// reschedule() already runs automatically once a slot actually frees up.
export function WaitlistTable({ rows, canManage }: WaitlistTableProps) {
  if (rows.length === 0) {
    return (
      <p className="rounded border border-dashed border-[var(--color-ink)]/20 px-4 py-8 text-center text-sm text-[var(--color-ink)]/60">
        No waitlist entries.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto lunia-card">
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--color-cream)]/60">
          <tr>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Customer</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Service</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Desired date</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Status</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Added</th>
            <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Notified</th>
            {canManage && <th className="whitespace-nowrap px-4 py-2 font-medium text-[var(--color-ink)]">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-t border-[var(--color-ink)]/10 align-top"
              data-testid="waitlist-row"
              data-waitlist-id={row.id}
              data-waitlist-status={row.status}
            >
              <td className="px-4 py-3 text-[var(--color-ink)]">
                <div className="flex flex-col">
                  <span>{row.contactName}</span>
                  {row.contactDetail && <span className="text-xs text-[var(--color-ink)]/60">{row.contactDetail}</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-[var(--color-ink)]">{row.serviceName}</td>
              <td className="px-4 py-3 text-[var(--color-ink)]">
                <div className="flex flex-col">
                  <span>{formatDate(row.desiredDateISO)}</span>
                  {row.desiredWindow && <span className="text-xs text-[var(--color-ink)]/60">{row.desiredWindow}</span>}
                </div>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                    STATUS_STYLES[row.status] ?? "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70"
                  }`}
                >
                  {row.status}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--color-ink)]/70">
                {formatDateTime(row.createdAtIso)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--color-ink)]/70">
                {row.notifiedAtIso ? formatDateTime(row.notifiedAtIso) : "None"}
              </td>
              {canManage && (
                <td className="px-4 py-3">
                  {row.status === "WAITING" && (
                    <NotifyNowButton serviceId={row.serviceId} desiredDateISO={row.desiredDateISO} />
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
