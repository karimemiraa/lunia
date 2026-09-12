import { notFound } from "next/navigation";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getClientDetail } from "@/modules/crm/clients";
import { listTiers } from "@/modules/iam/tiers";
import { getPreference } from "@/modules/comms/preferences";
import { getLoyalty } from "@/modules/crm/loyalty";
import { TierEditor } from "./TierEditor";
import { VisitNoteForm } from "./VisitNoteForm";
import { VisitNoteRow } from "./VisitNoteRow";
import { NotificationPreferenceEditor } from "./NotificationPreferenceEditor";
import { LoyaltyAdjustForm } from "./LoyaltyAdjustForm";

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

const CENTER_TZ = "Asia/Riyadh";

/** ltvCacheMinor is stored in halalas (1/100 SAR). */
function formatSar(minor: number): string {
  const major = minor / 100;
  return `${major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SAR`;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "medium", timeStyle: "short" }).format(date);
}

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70",
  CONFIRMED: "bg-[var(--color-teal)]/20 text-[var(--color-ink)]",
  CHECKED_IN: "bg-[var(--color-gold)]/25 text-[var(--color-ink)]",
  COMPLETED: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-red-100 text-red-700",
};

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = await params;
  const user = await requireAdmin(PERMISSIONS.CLIENT_VIEW);
  const canManage = user.permissions.has(PERMISSIONS.CLIENT_MANAGE);
  const canWriteNotes = user.permissions.has(PERMISSIONS.VISITNOTE_WRITE);

  const [detail, tiers] = await Promise.all([getClientDetail(id), canManage ? listTiers() : Promise.resolve([])]);
  if (!detail) notFound();

  const preference = canManage ? await getPreference(detail.profile.id) : null;
  const loyalty = await getLoyalty(detail.profile.id);

  return (
    <AdminShell user={user} title={detail.profile.fullName} description="Client profile, treatment history, and visit notes.">
      <div className="flex flex-col gap-8">
        <section className="grid grid-cols-1 gap-4 rounded border border-[var(--color-ink)]/10 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Phone</p>
            <p className="text-sm text-[var(--color-ink)]">{detail.phone ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Source</p>
            <p className="text-sm text-[var(--color-ink)]">{detail.source ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Lifetime value</p>
            <p className="text-sm text-[var(--color-ink)]">{formatSar(detail.ltvMinor)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Current tier</p>
            <p className="text-sm text-[var(--color-ink)]" data-testid="current-tier">
              {detail.tier?.name ?? "No tier (guest)"}
            </p>
          </div>
        </section>

        {canManage && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Edit tier</h2>
            <TierEditor clientProfileId={detail.profile.id} currentTierId={detail.tier?.id ?? null} tiers={tiers} />
          </section>
        )}

        {canManage && preference && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
              Notification preferences
            </h2>
            <NotificationPreferenceEditor clientProfileId={detail.profile.id} preference={preference} />
          </section>
        )}

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Loyalty points</h2>
          <div className="grid grid-cols-1 gap-4 rounded border border-[var(--color-ink)]/10 p-5 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Balance</p>
              <p className="text-lg font-medium text-[var(--color-ink)]" data-testid="loyalty-balance">
                {loyalty.balance.toLocaleString("en-US")} pts
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Current tier</p>
              <p className="text-sm text-[var(--color-ink)]">{loyalty.currentTier?.name ?? "No tier (guest)"}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Next tier</p>
              <p className="text-sm text-[var(--color-ink)]">
                {loyalty.nextTier
                  ? `${loyalty.nextTier.name} (${loyalty.pointsToNextTier?.toLocaleString("en-US")} pts to go)`
                  : "Top tier reached"}
              </p>
            </div>
          </div>

          {canManage && <LoyaltyAdjustForm clientProfileId={detail.profile.id} />}

          {loyalty.transactions.length > 0 && (
            <div className="overflow-x-auto rounded border border-[var(--color-ink)]/10">
              <table className="w-full text-left text-sm" data-testid="loyalty-transactions-table">
                <thead className="bg-[var(--color-cream)]/60">
                  <tr>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Date</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Reason</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {loyalty.transactions.map((txn) => (
                    <tr key={txn.id} className="border-t border-[var(--color-ink)]/10">
                      <td className="px-4 py-2 text-[var(--color-ink)]">{formatDateTime(txn.createdAt)}</td>
                      <td className="px-4 py-2 text-[var(--color-ink)]">{txn.reason}</td>
                      <td className={`px-4 py-2 font-medium ${txn.deltaPoints < 0 ? "text-red-700" : "text-[var(--color-ink)]"}`}>
                        {txn.deltaPoints > 0 ? "+" : ""}
                        {txn.deltaPoints}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
            Treatment history
          </h2>
          {detail.bookings.length === 0 ? (
            <p className="rounded border border-dashed border-[var(--color-ink)]/20 px-4 py-6 text-center text-sm text-[var(--color-ink)]/60">
              No bookings yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded border border-[var(--color-ink)]/10">
              <table className="w-full text-left text-sm" data-testid="treatment-history-table">
                <thead className="bg-[var(--color-cream)]/60">
                  <tr>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Service</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Date</th>
                    <th className="px-4 py-2 font-medium text-[var(--color-ink)]">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.bookings.map((booking) => (
                    <tr key={booking.id} className="border-t border-[var(--color-ink)]/10" data-testid="booking-row">
                      <td className="px-4 py-2 text-[var(--color-ink)]">{booking.serviceName}</td>
                      <td className="px-4 py-2 text-[var(--color-ink)]">{formatDateTime(booking.startAt)}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
                            STATUS_STYLES[booking.status] ?? "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70"
                          }`}
                        >
                          {booking.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">Visit notes</h2>

          {canWriteNotes && <VisitNoteForm clientProfileId={detail.profile.id} />}

          {detail.visitNotes.length === 0 ? (
            <p className="rounded border border-dashed border-[var(--color-ink)]/20 px-4 py-6 text-center text-sm text-[var(--color-ink)]/60">
              No visit notes yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="visit-notes-list">
              {detail.visitNotes.map((note) => (
                <VisitNoteRow
                  key={note.id}
                  note={note}
                  clientProfileId={detail.profile.id}
                  currentUserId={user.id}
                  canManage={canManage}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
