import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "../../_components/requireAdmin";
import { AdminShell } from "../../_components/AdminShell";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getClientDetail } from "@/modules/crm/clients";
import { listTiers } from "@/modules/iam/tiers";
import { getPreference } from "@/modules/comms/preferences";
import { getLoyalty } from "@/modules/crm/loyalty";
import { listClientCredits } from "@/modules/commerce/packages";
import { VisitNoteForm } from "./VisitNoteForm";
import { VisitNoteRow } from "./VisitNoteRow";
import { LoyaltyAdjustForm } from "./LoyaltyAdjustForm";
import { ClinicalForm } from "./ClinicalForm";
import { CustomerEditor } from "./CustomerEditor";
import { LeadPanel } from "./LeadPanel";
import { listLeadActivities } from "@/modules/crm/leads";
import { listStages } from "@/modules/crm/pipeline";
import { listStaffUsers } from "@/modules/iam/users";
import { canImpersonate } from "@/modules/iam/impersonation";
import { PatientFileTab } from "./clinical/_components/PatientFileTab";
import { ViewAsCustomer } from "./ViewAsCustomer";
import { listInvoices } from "@/modules/billing/invoices";
import { formatSarMinor } from "@/modules/billing/money";
import { StatusBadge } from "../../billing/ui";
import { loadCustomerTimeline } from "@/modules/crm/timeline";
import { nextBestActions, type NextBestAction } from "@/modules/crm/nextBestAction";
import { consentStatusForClient } from "@/modules/clinical/consents";
import { getIntakeOverview } from "@/modules/clinical/intake";
import { prisma } from "@/lib/db";
import { ProfileTabs, type ProfileTabDef } from "./c360/ProfileTabs";
import { TimelineFeed, type TimelineEntryDTO } from "./c360/TimelineFeed";
import { QuickActions } from "./c360/QuickActions";
import { Icon, type IconName } from "./c360/icons";

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
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
const dateISOFor = (d: Date) => new Date(d.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

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

const PRIORITY_STYLE: Record<NextBestAction["priority"], string> = {
  high: "border-[var(--color-gold)]/60 bg-[var(--color-gold)]/10",
  medium: "border-[var(--color-teal)]/50 bg-[var(--color-teal)]/10",
  low: "border-[var(--line)] bg-[var(--surface)]",
};

function Metric({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-[var(--color-ink)]/50">{label}</p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--color-ink)]">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-[var(--color-ink)]/45">{hint}</p>}
    </>
  );
  const cls = "lunia-card block min-w-0 px-4 py-3.5";
  return href ? (
    <Link href={href} className={`${cls} transition-colors duration-200 ease-out hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Chip({ icon, children, tone = "neutral", href, title }: { icon?: IconName; children: React.ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" | "teal"; href?: string; title?: string }) {
  const tones = {
    neutral: "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/70",
    ok: "bg-[var(--color-canopy)]/25 text-[var(--color-ink)]",
    warn: "bg-[var(--color-gold)]/25 text-[#7c6a2f]",
    danger: "bg-red-100 text-red-800",
    teal: "bg-[var(--color-teal)]/20 text-[var(--color-teal-ink)]",
  };
  const cls = `inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`;
  const inner = (
    <>
      {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
      {children}
    </>
  );
  return href ? (
    <Link href={href} title={title} className={`${cls} hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)]`}>
      {inner}
    </Link>
  ) : (
    <span className={cls} title={title}>
      {inner}
    </span>
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

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--color-ink)]/55">{children}</p>;
}

const contactLink =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-3 text-[var(--color-ink)]/80 transition-colors duration-150 ease-out hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)]";

export default async function ClientDetailPage({ params, searchParams }: ClientDetailPageProps) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  const user = await requireAdmin(PERMISSIONS.CLIENT_VIEW);
  const canManage = user.permissions.has(PERMISSIONS.CLIENT_MANAGE);
  const canWriteNotes = user.permissions.has(PERMISSIONS.VISITNOTE_WRITE);
  const canClinical = user.permissions.has(PERMISSIONS.CLINICAL_MANAGE);
  const canBill = user.permissions.has(PERMISSIONS.BILLING_MANAGE);
  const canBook = user.permissions.has(PERMISSIONS.BOOKING_MANAGE);
  const canViewAs = canImpersonate(user.permissions);

  const [detail, tiers] = await Promise.all([getClientDetail(id), canManage ? listTiers() : Promise.resolve([])]);
  if (!detail) notFound();
  const cid = detail.profile.id;

  const [preference, loyalty, credits, leadActivities, staffUsers, pipelineStages, invoices, timeline, consentRows, intake, openCallbacks, whatsappConversation, reviewableVisits, owner, bookingInvoices] =
    await Promise.all([
      canManage ? getPreference(cid) : Promise.resolve(null),
      getLoyalty(cid),
      listClientCredits(cid),
      canManage ? listLeadActivities(cid) : Promise.resolve([]),
      canManage ? listStaffUsers() : Promise.resolve([]),
      listStages(),
      canBill ? listInvoices({ clientProfileId: cid, take: 50 }) : Promise.resolve(null),
      loadCustomerTimeline(cid, { includeBilling: canBill, includeClinical: canClinical }),
      canClinical ? consentStatusForClient(cid) : Promise.resolve([]),
      canClinical ? getIntakeOverview(cid) : Promise.resolve(null),
      prisma.callbackRequest.count({ where: { clientProfileId: cid, status: { in: ["OPEN", "NO_ANSWER"] } } }),
      prisma.whatsappConversation.findFirst({ where: { clientProfileId: cid }, select: { id: true } }),
      prisma.booking.count({ where: { clientProfileId: cid, status: "COMPLETED", review: null } }),
      detail.profile.ownerId ? prisma.staffProfile.findUnique({ where: { userId: detail.profile.ownerId }, select: { fullName: true } }) : Promise.resolve(null),
      canBill
        ? prisma.invoice.findMany({ where: { clientProfileId: cid, bookingId: { not: null }, kind: "INVOICE", status: { not: "VOID" } }, select: { id: true, number: true, status: true, bookingId: true } })
        : Promise.resolve([]),
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
  const unpaidInvoices = (invoices?.rows ?? [])
    .filter((i) => i.kind === "INVOICE" && (i.status === "ISSUED" || i.status === "PARTIALLY_PAID") && i.totalMinor > i.paidMinor)
    .map((i) => ({ id: i.id, number: i.number, outstandingMinor: i.totalMinor - i.paidMinor }));
  const outstandingMinor = unpaidInvoices.reduce((s, i) => s + i.outstandingMinor, 0);
  const missingConsents = consentRows.filter((r) => r.required && !r.upToDate).map((r) => ({ formId: r.formId, title: r.titleEn, bookingIds: r.bookingIds }));
  const highFlags = intake?.flags.filter((f) => f.severity === "high") ?? [];
  const cautionFlags = intake?.flags.filter((f) => f.severity === "caution") ?? [];
  const stage = pipelineStages.find((s) => s.key === detail.profile.stage);

  const bookHref = `/admin/calendar?${new URLSearchParams({ name: detail.profile.fullName, ...(detail.phone ? { phone: detail.phone } : {}) }).toString()}`;
  const actions = nextBestActions({
    clientProfileId: cid,
    now,
    lastVisitAt: lastVisitAt ?? null,
    nextAppointmentAt: nextAppt ?? null,
    packageSessionsRemaining: packageSessions,
    unpaidInvoices,
    missingConsents,
    openCallbacks,
    nextFollowUpAt: detail.profile.nextFollowUpAt,
    reviewableVisits,
    fullName: detail.profile.fullName,
    phone: detail.phone,
  });

  const timelineDto: TimelineEntryDTO[] = timeline.map(({ at, ...rest }) => ({ ...rest, atIso: at.toISOString() }));
  const pinnedNotes = detail.visitNotes.filter((n) => n.pinned);
  const invoiceByBooking = new Map(bookingInvoices.map((i) => [i.bookingId!, i]));

  // --- Tab: Overview (timeline + next best action) ----------------------------
  const overview = (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <SectionCard title="Timeline">
        <TimelineFeed entries={timelineDto} canSeePhotos={canClinical} />
      </SectionCard>
      <aside className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-ink)]/60">
          <Icon name="spark" className="h-4 w-4 text-[var(--color-teal-ink)]" /> Next best action
        </h2>
        {actions.length === 0 ? (
          <p className="rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] px-4 py-5 text-sm text-[var(--color-ink)]/55">Nothing pressing. They are booked, paid up and consented.</p>
        ) : (
          <ol className="flex flex-col gap-2" data-testid="next-best-actions">
            {actions.map((a) => (
              <li key={a.key} className={`flex flex-col gap-1.5 rounded-[var(--radius-sm)] border px-4 py-3 ${PRIORITY_STYLE[a.priority]}`}>
                <p className="text-sm font-medium text-[var(--color-ink)]">{a.title}</p>
                <p className="text-xs text-[var(--color-ink)]/60">{a.reason}</p>
                <Link href={a.href} className="lunia-btn lunia-btn-forest-outline lunia-btn-sm mt-1 min-h-9 w-fit">
                  {a.cta}
                </Link>
              </li>
            ))}
          </ol>
        )}
        {whatsappConversation && (
          <Link href={`/admin/whatsapp?c=${whatsappConversation.id}`} className="text-xs text-[var(--color-teal-ink)] hover:underline">
            Open WhatsApp thread
          </Link>
        )}
      </aside>
    </div>
  );

  // --- Tab: Notes (comments) ----------------------------------------------------
  const notesTab = (
    <SectionCard title="Comments">
      {canWriteNotes && <VisitNoteForm clientProfileId={cid} />}
      {detail.visitNotes.length === 0 ? (
        <Empty>No comments yet.</Empty>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="visit-notes-list">
          {detail.visitNotes.map((note) => (
            <VisitNoteRow key={note.id} note={note} clientProfileId={cid} currentUserId={user.id} canManage={canManage} canWrite={canWriteNotes} />
          ))}
        </ul>
      )}
    </SectionCard>
  );

  // --- Tab: Appointments -------------------------------------------------------
  const appointments =
    detail.bookings.length === 0 ? (
      <Empty>No bookings yet.</Empty>
    ) : (
      <div className="overflow-x-auto lunia-card">
        <table className="w-full text-left text-sm" data-testid="treatment-history-table">
          <thead>
            <tr className="border-b border-[var(--line)] bg-[var(--surface-2)] text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
              <th className="px-4 py-3 font-semibold">Service</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Related</th>
            </tr>
          </thead>
          <tbody>
            {detail.bookings.map((booking) => {
              const inv = invoiceByBooking.get(booking.id);
              return (
                <tr key={booking.id} className="border-t border-[var(--line)]" data-testid="booking-row">
                  <td className="px-4 py-3 text-[var(--color-ink)]">{booking.serviceName}</td>
                  <td className="px-4 py-3 text-[var(--color-ink)]/80">{formatDateTime(booking.startAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${STATUS_STYLES[booking.status] ?? "bg-[var(--color-ink)]/10 text-[var(--color-ink)]/70"}`}>
                      {booking.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1.5">
                      <Chip icon="calendar" href={`/admin/calendar?day=${dateISOFor(booking.startAt)}`}>
                        Calendar
                      </Chip>
                      {inv && (
                        <Chip icon="receipt" href={`/admin/billing/${inv.id}`} tone="teal">
                          {inv.status === "DRAFT" ? "Draft invoice" : inv.number}
                        </Chip>
                      )}
                      {booking.treatmentRecordId && canClinical && (
                        <Chip icon="treatment" href={`/admin/clients/${cid}/clinical/treatment/${booking.treatmentRecordId}`} tone="teal">
                          Treatment record
                        </Chip>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  // --- Tab: Loyalty ------------------------------------------------------------
  const loyaltyTab = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Balance" value={`${loyalty.balance.toLocaleString("en-US")} pts`} />
        <Metric label="Current tier" value={loyalty.currentTier?.name ?? "Guest"} />
        <Metric label="Next tier" value={loyalty.nextTier ? loyalty.nextTier.name : "Top tier"} hint={loyalty.nextTier ? `${loyalty.pointsToNextTier?.toLocaleString("en-US")} pts to go` : undefined} />
      </div>
      <span className="hidden" data-testid="loyalty-balance">
        {loyalty.balance.toLocaleString("en-US")} pts
      </span>
      {canManage && <LoyaltyAdjustForm clientProfileId={cid} />}
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

  // --- Tab: Credits ------------------------------------------------------------
  const creditsTab = (
    <div className="flex flex-col gap-8">
      <SectionCard title="Gift cards">
        {credits.giftCards.length === 0 ? (
          <Empty>No active gift cards.</Empty>
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
          <Empty>No active packages.</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {credits.packages.map((p) => (
              <li key={p.id} className="lunia-card flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm text-[var(--color-ink)]">{p.packageNameEn}</span>
                <span className="flex items-center gap-3">
                  <span className="font-medium text-[var(--color-ink)]">
                    {p.sessionsRemaining}/{p.sessionsTotal} sessions
                  </span>
                  {p.sessionsRemaining > 0 && canBook && (
                    <Link href={bookHref} className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-9">
                      Book next
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );

  // --- Tab: Clinical (skin profile, tags, consent) -----------------------------
  const clinicalTab = canManage ? (
    <ClinicalForm
      clientProfileId={cid}
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

  const pipelineTab = canManage ? (
    <LeadPanel
      clientProfileId={cid}
      stage={detail.profile.stage}
      ownerId={detail.profile.ownerId}
      direction={detail.profile.direction}
      source={detail.profile.sourceChannel}
      nextFollowUpIso={detail.profile.nextFollowUpAt ? detail.profile.nextFollowUpAt.toISOString() : null}
      staff={staffUsers.map((s) => ({ id: s.id, name: s.fullName || s.email || "Staff" }))}
      stages={pipelineStages.map((s) => ({ value: s.key, label: s.label }))}
      activities={leadActivities.map((a) => ({ id: a.id, kind: a.kind, outcome: a.outcome, body: a.body, authorName: a.authorName, createdAtIso: a.createdAt.toISOString() }))}
    />
  ) : (
    <Empty>You do not have access to the sales pipeline.</Empty>
  );

  // --- Tab: Invoices (billing:manage) ------------------------------------------
  const invoicesTab = invoices ? (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Link href={`/admin/billing/new?client=${cid}`} className="lunia-btn lunia-btn-forest-outline min-h-[44px]">
          New invoice
        </Link>
      </div>
      {invoices.rows.length === 0 ? (
        <Empty>No invoices yet.</Empty>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="client-invoices">
          {invoices.rows.map((inv) => (
            <li key={inv.id}>
              <Link href={`/admin/billing/${inv.id}`} className="lunia-card flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="flex items-center gap-3">
                  <span className="font-medium">{inv.status === "DRAFT" ? "Draft" : inv.number}</span>
                  <StatusBadge status={inv.status} kind={inv.kind} />
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-[var(--color-ink)]/50">{formatDate(inv.issuedAt ?? inv.createdAt)}</span>
                  <span className="font-medium tabular-nums">
                    {inv.kind === "CREDIT_NOTE" ? "−" : ""}
                    {formatSarMinor(inv.totalMinor)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  ) : null;

  const tabs: ProfileTabDef[] = [
    { id: "overview", label: "Overview", content: overview, badge: actions.length },
    { id: "notes", label: "Notes", content: notesTab, badge: detail.visitNotes.length },
    { id: "pipeline", label: "Pipeline", content: pipelineTab, badge: leadActivities.length },
    { id: "appointments", label: "Appointments", content: appointments, badge: detail.bookings.length },
    { id: "clinical", label: "Clinical", content: clinicalTab },
    ...(canClinical ? [{ id: "patient", label: "Patient file", content: <PatientFileTab clientProfileId={cid} /> }] : []),
    { id: "loyalty", label: "Loyalty", content: loyaltyTab },
    { id: "credits", label: "Credits", content: creditsTab, badge: credits.giftCards.length + credits.packages.length },
    ...(invoicesTab ? [{ id: "invoices", label: "Invoices", content: invoicesTab, badge: invoices?.rows.length }] : []),
  ];

  return (
    <AdminShell user={user} title={detail.profile.fullName || "Customer"} description="Everything about this customer in one place: contact, value, history, and what to do next.">
      <div className="flex flex-col gap-6">
        {/* Header card: identity, badges, contact actions */}
        <div className="lunia-card flex flex-col gap-4 px-5 py-4" data-testid="profile-header">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${LIFECYCLE[lifecycle].className}`}>{LIFECYCLE[lifecycle].label}</span>
                <span className="inline-flex rounded-full bg-[var(--color-ink)]/8 px-2.5 py-0.5 text-xs font-medium text-[var(--color-ink)]/70" data-testid="current-tier">
                  {detail.tier?.name ?? "No tier (guest)"}
                </span>
                {stage && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-ink)]/[0.06] px-2.5 py-0.5 text-xs font-medium text-[var(--color-ink)]/75">
                    <span className="h-2 w-2 rounded-full" style={{ background: stage.color || "var(--color-ink)" }} />
                    {stage.label}
                  </span>
                )}
                {owner && <Chip icon="user">{owner.fullName}</Chip>}
                {detail.source && <span className="inline-flex rounded-full bg-[var(--color-ink)]/8 px-2.5 py-0.5 text-xs text-[var(--color-ink)]/60">via {detail.source}</span>}
                <span className="text-xs text-[var(--color-ink)]/45">Customer since {formatDate(detail.profile.createdAt)}</span>
              </div>

              {/* Contact actions */}
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {detail.phone && (
                  <a href={`tel:${detail.phone}`} dir="ltr" className={contactLink}>
                    <Icon name="phone" className="h-3.5 w-3.5" /> {detail.phone}
                  </a>
                )}
                {detail.phone && (
                  <a href={`https://wa.me/${detail.phone.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer" className={contactLink}>
                    <Icon name="whatsapp" className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                )}
                {detail.email && (
                  <a href={`mailto:${detail.email}`} className={contactLink}>
                    <Icon name="mail" className="h-3.5 w-3.5" /> {detail.email}
                  </a>
                )}
                {!detail.phone && !detail.email && <span className="text-[var(--color-ink)]/55">No contact on file</span>}
              </div>

              {/* Consent + safety chips */}
              <div className="flex flex-wrap gap-1.5" data-testid="profile-chips">
                <Chip icon={detail.profile.consentTreatmentAt ? "check" : "warning"} tone={detail.profile.consentTreatmentAt ? "ok" : "warn"} title={detail.profile.consentTreatmentAt ? `Given ${formatDate(detail.profile.consentTreatmentAt)}` : undefined}>
                  Treatment consent {detail.profile.consentTreatmentAt ? "on file" : "missing"}
                </Chip>
                <Chip icon={detail.profile.consentDataAt ? "check" : "warning"} tone={detail.profile.consentDataAt ? "ok" : "warn"}>
                  Data consent {detail.profile.consentDataAt ? "on file" : "missing"}
                </Chip>
                {missingConsents.map((c) => (
                  <Chip key={c.formId} icon="consent" tone={c.bookingIds.length > 0 ? "danger" : "warn"} href={`/admin/clients/${cid}/clinical/sign/${c.formId}`}>
                    Sign: {c.title}
                  </Chip>
                ))}
                {detail.profile.allergies && (
                  <Chip icon="warning" tone="danger" title={detail.profile.allergies}>
                    Allergies: {detail.profile.allergies.length > 40 ? `${detail.profile.allergies.slice(0, 39)}…` : detail.profile.allergies}
                  </Chip>
                )}
                {highFlags.map((f) => (
                  <Chip key={f.key} icon="warning" tone="danger" href={`/admin/clients/${cid}/clinical/intake`} title={f.review}>
                    {f.title}
                  </Chip>
                ))}
                {cautionFlags.map((f) => (
                  <Chip key={f.key} icon="warning" tone="warn" href={`/admin/clients/${cid}/clinical/intake`} title={f.review}>
                    {f.title}
                  </Chip>
                ))}
                {detail.profile.tags.map((tag) => (
                  <Chip key={tag} tone="teal">
                    {tag}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
              {canManage && preference && (
                <CustomerEditor clientProfileId={cid} fullName={detail.profile.fullName} phone={detail.phone} email={detail.email} source={detail.source ?? null} currentTierId={detail.tier?.id ?? null} tiers={tiers} preference={preference} />
              )}
              {canViewAs && <ViewAsCustomer clientProfileId={cid} />}
            </div>
          </div>

          <QuickActions
            clientProfileId={cid}
            bookHref={bookHref}
            checkoutHref={canBill ? `/admin/billing/new?client=${cid}` : null}
            hasPhone={Boolean(detail.phone)}
            canManage={canManage}
            canWriteNotes={canWriteNotes}
            reviewableVisits={reviewableVisits}
          />
        </div>

        {/* Pinned comments: front-desk-critical flags */}
        {pinnedNotes.length > 0 && (
          <ul className="flex flex-col gap-2" data-testid="pinned-comments">
            {pinnedNotes.map((note) => (
              <li key={note.id} className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-[var(--color-gold)]/45 bg-[var(--color-gold)]/8 px-4 py-2.5 text-sm text-[var(--color-ink)]">
                <Icon name="note" className="mt-0.5 h-4 w-4 shrink-0 text-[#7c6a2f]" />
                <span className="whitespace-pre-wrap">{note.body}</span>
              </li>
            ))}
          </ul>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="kpi-strip">
          <Metric label="Lifetime value" value={formatSar(detail.ltvMinor)} />
          <Metric label="Visits" value={String(completed.length)} hint={`${detail.bookings.length} bookings`} href={`/admin/clients/${cid}?tab=appointments`} />
          <Metric label="Last visit" value={formatDate(lastVisitAt)} />
          <Metric label="Next appt" value={formatDate(nextAppt)} href={nextAppt ? `/admin/calendar?day=${dateISOFor(nextAppt)}` : undefined} />
          <Metric label="Loyalty" value={`${loyalty.balance.toLocaleString("en-US")} pts`} hint={loyalty.currentTier?.name} href={`/admin/clients/${cid}?tab=loyalty`} />
          {canBill && <Metric label="Outstanding" value={formatSar(outstandingMinor)} hint={unpaidInvoices.length ? `${unpaidInvoices.length} unpaid` : "All paid"} href={`/admin/clients/${cid}?tab=invoices`} />}
          <Metric label="Packages" value={`${packageSessions} left`} hint={credits.packages.length ? `${credits.packages.length} active` : undefined} href={`/admin/clients/${cid}?tab=credits`} />
          <Metric label="Gift cards" value={formatSar(giftCardBalance)} hint={credits.giftCards.length ? `${credits.giftCards.length} active` : undefined} href={`/admin/clients/${cid}?tab=credits`} />
        </div>

        <ProfileTabs tabs={tabs} initialTab={tab} />
      </div>
    </AdminShell>
  );
}
