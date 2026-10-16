import Link from "next/link";
import { requireAdmin } from "../_components/requireAdmin";
import { AdminShell } from "../_components/AdminShell";
import { getStaffLocale, getStaffT } from "../_i18n/display";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getBoard } from "@/modules/booking/journey";
import { nextPrayer, prayerTimes } from "@/modules/booking/prayer";
import { VisitBoard } from "./VisitBoard";
import { ArrivalAlertsToggle } from "../_components/ArrivalAlerts";

// The live visit board (docs/PRD-visit-journey.md): every customer in the
// clinic today, by where she is — expected, waiting, consultation, treatment,
// checkout, left — with live timers and the one next action. Front desk sees
// everyone; specialists default to their own customers.
export default async function VisitBoardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireAdmin(PERMISSIONS.BOOKING_VIEW);
  const [t, locale, params] = await Promise.all([getStaffT(), getStaffLocale(), searchParams]);
  const canManage = user.permissions.has(PERMISSIONS.BOOKING_MANAGE);
  const view = params.view === "all" || params.view === "mine" ? params.view : canManage ? "all" : "mine";
  const now = new Date();
  const board = await getBoard(now, view === "mine" ? { staffUserId: user.id } : {});
  const prayer = board.settings.prayerTimes ? { next: nextPrayer(now), today: prayerTimes(now) } : null;

  const chip = (v: "all" | "mine", label: string) => (
    <Link
      href={`/admin/visits?view=${v}`}
      aria-current={view === v ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors ${view === v ? "border-[var(--color-forest)] bg-[var(--color-forest)] text-white" : "border-[var(--line-strong)] text-[var(--color-ink)]/75 hover:bg-[var(--color-ink)]/5"}`}
    >
      {t(label)}
    </Link>
  );

  return (
    <AdminShell
      user={user}
      title="Visit board"
      description="Every customer in the clinic right now — who is waiting, who has her, and what comes next."
      actions={
        <div className="flex flex-wrap gap-2" data-testid="visit-view">
          {chip("all", "Everyone")}
          {chip("mine", "My customers")}
          <ArrivalAlertsToggle />
        </div>
      }
    >
      <VisitBoard
        board={board}
        locale={locale}
        viewerId={user.id}
        canManage={canManage}
        canBill={user.permissions.has(PERMISSIONS.BILLING_MANAGE)}
        canClinical={user.permissions.has(PERMISSIONS.CLINICAL_MANAGE)}
        prayer={prayer && { next: { prayer: prayer.next.prayer, at: prayer.next.at.toISOString() }, today: prayer.today.map((p) => ({ prayer: p.prayer, at: p.at.toISOString() })) }}
      />
    </AdminShell>
  );
}
