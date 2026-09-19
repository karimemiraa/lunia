import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { Tabs, type TabDef } from "../../_components/Tabs";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getClientDetail } from "@/modules/crm/clients";
import { listTiers } from "@/modules/iam/tiers";
import { getPreference } from "@/modules/comms/preferences";
import { getLoyalty } from "@/modules/crm/loyalty";
import { listClientCredits } from "@/modules/commerce/packages";
import { TierEditor } from "./TierEditor";
import { VisitNoteForm } from "./VisitNoteForm";
import { VisitNoteRow } from "./VisitNoteRow";
import { NotificationPreferenceEditor } from "./NotificationPreferenceEditor";
import { LoyaltyAdjustForm } from "./LoyaltyAdjustForm";
import { ClinicalForm } from "./ClinicalForm";
import { CustomerEditor } from "./CustomerEditor";
import { LeadPanel } from "./LeadPanel";
import { listLeadActivities } from "@/modules/crm/leads";
import { listStaffUsers } from "@/modules/iam/users";

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

const CENTER_TZ = "Asia/Riyadh";
const ACTIVE_WINDOW_DAYS = 90;

function formatSar(minor: number): string {
  return `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} SAR`;
}
const dtFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "medium", timeStyle: "short" });
const dFmt = new Intl.DateTimeFormat("en-US", { timeZone: CENTER_TZ, dateStyle: "medium" });
const formatDateTime = (d: Date) => dtFmt.format(d);
const formatDate = (d: Date | undefined | null) => (d ? dFmt.format(d) : "None");

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70",
  CONFIRMED: "bg-[var(--color-teal)]/20 text-[var(--color-ink)]",
  CHECKED_IN: "bg-[var(--color-gold)]/25 text-[var(--color-ink)]",
  COMPLETED: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
  CANCELLED: "bg-red-100 text-red-700",
  NO_SHOW: "bg-red-100 text-red-700",
};

const LIFECYCLE = {
  new: { label: "New", className: "bg-[var(--color-gold)]/25 text-[#7c6a2f]" },
  active: { label: "Active", className: "bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]" },
  lapsed: { label: "Lapsed", className: "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/55" },
};

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="lunia-card px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/50">{label}</p>
      <p className="mt-1 text-2xl font-medium text-[var(--color-ink)]">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-[var(--color-ink)]/45">{hint}</p>}
    </div>
  );
}

function SectionCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">{title}</h2>}
      {children}
    </section>
  );
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = await params;
  const user = await requireAdmin(PERMISSIONS.CLIENT_VIEW);
  const canManage = user.permissions.has(PERMISSIONS.CLIENT_MANAGE);
  const canWriteNotes = user.permissions.has(PERMISSIONS.VISITNOTE_WRITE);

  const [detail, tiers] = await Promise.all([getClientDetail(id), canManage ? listTiers() : Promise.resolve([])]);
  if (!detail) notFound();

  const [preference, loyalty, credits, leadActivities, staffUsers] = await Promise.all([
    canManage ? getPreference(detail.profile.id) : Promise.resolve(null),
    getLoyalty(detail.profile.id),
    listClientCredits(detail.profile.id),
    canManage ? listLeadActivities(detail.profile.id) : Promise.resolve([]),
    canManage ? listStaffUsers() : Promise.resolve([]),
  ]);

  // Derived metrics from the booking history.
  const now = new Date();
  const activeCutoff = new Date(now.getTime() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const completed = detail.bookings.filter((b) => b.status === "COMPLETED");
  const lastVisitAt = completed.reduce<Date | undefined>((max, b) => (!max || b.startAt > max ? b.startAt : max), undefined);
  const nextAppt = detail.bookings
    .filter((b) => (b.status === "REQUESTED" || b.status === "CONFIRMED" || b.status === "CHECKED_IN") && b.startAt > now)
    .reduce<Date | undefined>((min, b) => (!min || b.startAt < min ? b.startAt : min), undefined);
  const lifecycle = !lastVisitAt ? "new" : lastVisitAt >= activeCutoff ? "active" : "lapsed";
  const giftCardBalance = credits.giftCards.reduce((sum, g) => sum + g.balanceMinor, 0);
  const packageSessions = credits.packages.reduce((sum, p) => sum + p.sessionsRemaining, 0);

  const contact = [detail.phone, detail.email].filter(Boolean).join("  ·  ") || "No contact on file";

  const pinnedNotes = detail.visitNotes.filter((n) => n.pinned);

  // --- Tab: Overview (staff-editable: comments, tier, preferences) -----------
  const overview = (
    <div className="flex flex-col gap-8">
      <SectionCard title="Comments">
        {canWriteNotes && <VisitNoteForm clientProfileId={detail.profile.id} />}
        {detail.visitNotes.length === 0 ? (
          <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">
            No comments yet.
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
                canWrite={canWriteNotes}
              />
            ))}
          </ul>
        )}
      </SectionCard>
      {canManage && (
        <SectionCard title="Membership tier">
          <TierEditor clientProfileId={detail.profile.id} currentTierId={detail.tier?.id ?? null} tiers={tiers} />
        </SectionCard>
      )}
      {canManage && preference && (
        <SectionCard title="Notification preferences">
          <NotificationPreferenceEditor clientProfileId={detail.profile.id} preference={preference} />
        </SectionCard>
      )}
    </div>
  );

  // --- Tab: Appointments -----------------------------------------------------
  const appointments =
    detail.bookings.length === 0 ? (
      <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">
        No bookings yet.
      </p>
    ) : (
      <div className="overflow-x-auto lunia-card">
        <table className="w-full text-left text-sm" data-testid="treatment-history-table">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
              <th className="px-4 py-3 font-semibold">Service</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {detail.bookings.map((booking) => (
              <tr key={booking.id} className="border-t border-[var(--line)]" data-testid="booking-row">
                <td className="px-4 py-3 text-[var(--color-ink)]">{booking.serviceName}</td>
                <td className="px-4 py-3 text-[var(--color-ink)]/80">{formatDateTime(booking.startAt)}</td>
                <td className="px-4 py-3">
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
    );

  // --- Tab: Loyalty ----------------------------------------------------------
  const loyaltyTab = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Balance" value={`${loyalty.balance.toLocaleString("en-US")} pts`} />
        <Metric label="Current tier" value={loyalty.currentTier?.name ?? "Guest"} />
        <Metric
          label="Next tier"
          value={loyalty.nextTier ? loyalty.nextTier.name : "Top tier"}
          hint={loyalty.nextTier ? `${loyalty.pointsToNextTier?.toLocaleString("en-US")} pts to go` : undefined}
        />
      </div>
      <span className="hidden" data-testid="loyalty-balance">
        {loyalty.balance.toLocaleString("en-US")} pts
      </span>
      {canManage && <LoyaltyAdjustForm clientProfileId={detail.profile.id} />}
      {loyalty.transactions.length > 0 && (
        <div className="overflow-x-auto lunia-card">
          <table className="w-full text-left text-sm" data-testid="loyalty-transactions-table">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
                <th className="px-4 py-3 text-right font-semibold">Points</th>
              </tr>
            </thead>
            <tbody>
              {loyalty.transactions.map((txn) => (
                <tr key={txn.id} className="border-t border-[var(--line)]">
                  <td className="px-4 py-3 text-[var(--color-ink)]/80">{formatDateTime(txn.createdAt)}</td>
                  <td className="px-4 py-3 text-[var(--color-ink)]/80">{txn.reason}</td>
                  <td className={`px-4 py-3 text-right font-medium ${txn.deltaPoints < 0 ? "text-red-700" : "text-[var(--color-ink)]"}`}>
                    {txn.deltaPoints > 0 ? "+" : ""}
                    {txn.deltaPoints}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  // --- Tab: Credits ----------------------------------------------------------
  const creditsTab = (
    <div className="flex flex-col gap-8">
      <SectionCard title="Gift cards">
        {credits.giftCards.length === 0 ? (
          <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">
            No active gift cards.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {credits.giftCards.map((g) => (
              <li key={g.id} className="lunia-card flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-mono text-sm text-[var(--color-ink)]">{g.code}</p>
                  <p className="text-xs text-[var(--color-ink)]/50">{g.expiresAt ? `Expires ${formatDate(g.expiresAt)}` : "No expiry"}</p>
                </div>
                <span className="font-medium text-[var(--color-ink)]">{formatSar(g.balanceMinor)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title="Packages">
        {credits.packages.length === 0 ? (
          <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">
            No active packages.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {credits.packages.map((p) => (
              <li key={p.id} className="lunia-card flex items-center justify-between px-4 py-3">
                <span className="text-sm text-[var(--color-ink)]">{p.packageNameEn}</span>
                <span className="font-medium text-[var(--color-ink)]">
                  {p.sessionsRemaining}/{p.sessionsTotal} sessions
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );

  // --- Tab: Clinical (skin profile, tags, consent) ---------------------------
  const clinicalTab = canManage ? (
    <ClinicalForm
      clientProfileId={detail.profile.id}
      tags={detail.profile.tags}
      skinType={detail.profile.skinType}
      skinConcerns={detail.profile.skinConcerns}
      allergies={detail.profile.allergies}
      clinicalNotes={detail.profile.clinicalNotes}
      consentTreatment={detail.profile.consentTreatmentAt != null}
      consentData={detail.profile.consentDataAt != null}
    />
  ) : (
    <dl className="grid gap-4 lunia-card p-5 sm:grid-cols-2">
      <div>
        <dt className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/50">Skin type</dt>
        <dd className="text-sm text-[var(--color-ink)]">{detail.profile.skinType ?? "None"}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/50">Concerns</dt>
        <dd className="text-sm text-[var(--color-ink)]">{detail.profile.skinConcerns.join(", ") || "None"}</dd>
      </div>
      <div>
        <dt className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/50">Allergies</dt>
        <dd className="text-sm text-[var(--color-ink)]">{detail.profile.allergies ?? "None"}</dd>
      </div>
    </dl>
  );

  // --- Tab: Timeline (unified activity feed, newest first) -------------------
  type Entry = { at: Date; kind: "appointment" | "note" | "loyalty"; text: string };
  const timeline: Entry[] = [
    ...detail.bookings.map((b): Entry => ({ at: b.startAt, kind: "appointment", text: `${b.serviceName}: ${b.status.replace("_", " ").toLowerCase()}` })),
    ...detail.visitNotes.map((n): Entry => ({ at: n.createdAt, kind: "note", text: `Comment${n.authorName ? ` by ${n.authorName}` : ""}: ${n.body.slice(0, 120)}` })),
    ...loyalty.transactions.map((t): Entry => ({ at: t.createdAt, kind: "loyalty", text: `Loyalty ${t.reason.toLowerCase()} ${t.deltaPoints > 0 ? "+" : ""}${t.deltaPoints} pts` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const TIMELINE_DOT: Record<Entry["kind"], string> = {
    appointment: "bg-[var(--color-teal)]",
    note: "bg-[var(--color-gold)]",
    loyalty: "bg-[var(--color-canopy)]",
  };

  const timelineTab =
    timeline.length === 0 ? (
      <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">
        No activity yet.
      </p>
    ) : (
      <ol className="flex flex-col gap-4 border-s border-[var(--line)] ps-5">
        {timeline.map((e, i) => (
          <li key={i} className="relative">
            <span className={`absolute -start-[1.42rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--surface-2)] ${TIMELINE_DOT[e.kind]}`} />
            <p className="text-sm text-[var(--color-ink)]">{e.text}</p>
            <p className="text-xs text-[var(--color-ink)]/45">{formatDateTime(e.at)}</p>
          </li>
        ))}
      </ol>
    );

  const pipelineTab = canManage ? (
    <LeadPanel
      clientProfileId={detail.profile.id}
      stage={detail.profile.stage}
      ownerId={detail.profile.ownerId}
      direction={detail.profile.direction}
      source={detail.profile.sourceChannel}
      nextFollowUpIso={detail.profile.nextFollowUpAt ? detail.profile.nextFollowUpAt.toISOString() : null}
      staff={staffUsers.map((s) => ({ id: s.id, name: s.fullName || s.email || "Staff" }))}
      activities={leadActivities.map((a) => ({
        id: a.id,
        kind: a.kind,
        outcome: a.outcome,
        body: a.body,
        authorName: a.authorName,
        createdAtIso: a.createdAt.toISOString(),
      }))}
    />
  ) : (
    <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">
      You do not have access to the sales pipeline.
    </p>
  );

  const tabs: TabDef[] = [
    { id: "overview", label: "Overview", content: overview },
    { id: "pipeline", label: "Pipeline", content: pipelineTab, badge: leadActivities.length },
    { id: "appointments", label: "Appointments", content: appointments, badge: detail.bookings.length },
    { id: "clinical", label: "Clinical", content: clinicalTab },
    { id: "timeline", label: "Timeline", content: timelineTab, badge: timeline.length },
    { id: "loyalty", label: "Loyalty", content: loyaltyTab },
    { id: "credits", label: "Credits", content: creditsTab, badge: credits.giftCards.length + credits.packages.length },
  ];

  return (
    <AdminShell user={user} title={detail.profile.fullName || "Customer"} description="Full customer view: contact, value, history, loyalty, and credits.">
      <div className="flex flex-col gap-6">
        {/* Header: contact + badges + quick action */}
        <div className="lunia-card flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-[var(--color-ink)]/70">{contact}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${LIFECYCLE[lifecycle].className}`}>
                {LIFECYCLE[lifecycle].label}
              </span>
              <span className="inline-flex rounded-full bg-[var(--color-ink)]/8 px-2.5 py-0.5 text-xs font-medium text-[var(--color-ink)]/70" data-testid="current-tier">
                {detail.tier?.name ?? "No tier (guest)"}
              </span>
              {detail.source && (
                <span className="inline-flex rounded-full bg-[var(--color-ink)]/8 px-2.5 py-0.5 text-xs text-[var(--color-ink)]/60">
                  via {detail.source}
                </span>
              )}
              <span className="text-xs text-[var(--color-ink)]/45">Customer since {formatDate(detail.profile.createdAt)}</span>
            </div>
            {detail.profile.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {detail.profile.tags.map((tag) => (
                  <span key={tag} className="inline-flex rounded-full bg-[var(--color-teal)]/15 px-2.5 py-0.5 text-xs font-medium text-[var(--color-teal-ink)]">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {canManage && (
              <CustomerEditor
                clientProfileId={detail.profile.id}
                fullName={detail.profile.fullName}
                phone={detail.phone}
                email={detail.email}
                source={detail.source ?? null}
              />
            )}
            <Link
              href={`/admin/calendar?${new URLSearchParams({
                name: detail.profile.fullName,
                ...(detail.phone ? { phone: detail.phone } : {}),
              }).toString()}`}
              className="lunia-btn lunia-btn-forest"
            >
              New booking
            </Link>
          </div>
        </div>

        {/* Pinned comments: front-desk-critical flags (allergies, preferences) */}
        {pinnedNotes.length > 0 && (
          <ul className="flex flex-col gap-2" data-testid="pinned-comments">
            {pinnedNotes.map((note) => (
              <li
                key={note.id}
                className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-[var(--color-gold)]/45 bg-[var(--color-gold)]/8 px-4 py-2.5 text-sm text-[var(--color-ink)]"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="mt-0.5 shrink-0 text-[#7c6a2f]">
                  <path d="M16 3l5 5-2 2-1-1-4 4v5l-2 2-3-3-4 4-1-1 4-4-3-3 2-2h5l4-4-1-1 2-2z" />
                </svg>
                <span className="whitespace-pre-wrap">{note.body}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Metrics row */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <Metric label="Lifetime value" value={formatSar(detail.ltvMinor)} />
          <Metric label="Visits" value={String(completed.length)} hint={`${detail.bookings.length} bookings`} />
          <Metric label="Last visit" value={formatDate(lastVisitAt)} />
          <Metric label="Next appt" value={formatDate(nextAppt)} />
          <Metric label="Loyalty" value={`${loyalty.balance.toLocaleString("en-US")} pts`} hint={`${formatSar(giftCardBalance)} + ${packageSessions} sessions`} />
        </div>

        <Tabs tabs={tabs} />
      </div>
    </AdminShell>
  );
}
