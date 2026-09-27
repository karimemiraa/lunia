import Link from "next/link";
import { AdminShell } from "../../_components/AdminShell";
import { StatCard } from "@/components/admin/charts/StatCard";
import { requireCashDrawer } from "../_components/access";
import { ResponsiveTable, Section, Signed } from "../_components/ui";
import { CloseSessionForm, OpenSessionForm } from "./CashForms";
import { computeExpectedCash, getOpenCashSession, listCashSessions, staffNames, untaggedCashSince, STALE_SESSION_HOURS } from "@/modules/accounting/cash";
import { formatMinor } from "@/modules/accounting/periods";
import { PERMISSIONS } from "@/modules/iam/permissions";

const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Riyadh",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function hoursSince(date: Date, now: Date): number {
  return Math.floor((now.getTime() - date.getTime()) / 3_600_000);
}

interface CashPageProps {
  searchParams: Promise<{ closed?: string }>;
}

export default async function CashDrawerPage({ searchParams }: CashPageProps) {
  const user = await requireCashDrawer();
  const { closed } = await searchParams;
  const now = new Date();
  const open = await getOpenCashSession();
  const [totals, untagged, openedByName, history] = await Promise.all([
    open ? computeExpectedCash(open.id) : null,
    open ? untaggedCashSince(open.openedAt) : null,
    open ? staffNames([open.openedById]).then((m) => m.get(open.openedById) ?? "Staff") : null,
    listCashSessions(60),
  ]);
  const justClosed = closed ? history.find((s) => s.id === closed && s.closedAt) : undefined;
  const canSeeAccounting = user.permissions.has(PERMISSIONS.ACCOUNTING_MANAGE);

  return (
    <AdminShell
      user={user}
      title="Cash drawer"
      description="Open the drawer with a float, take cash through invoices, then count and close at the end of the day."
      actions={
        canSeeAccounting ? (
          <Link href="/admin/accounting" className="lunia-btn lunia-btn-ghost min-h-11">
            Accounting
          </Link>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-8">
        {justClosed && justClosed.varianceMinor !== null && (
          <div
            role="status"
            className={`lunia-card px-5 py-4 text-sm ${justClosed.varianceMinor === 0 ? "text-[var(--color-teal-ink)]" : "text-[#b42318]"}`}
            data-testid="cash-close-result"
          >
            {justClosed.varianceMinor === 0
              ? `Drawer closed. The count matches the expected ${formatMinor(justClosed.expectedCashMinor ?? 0)}.`
              : `Drawer closed ${justClosed.varianceMinor > 0 ? "over" : "short"} by ${formatMinor(Math.abs(justClosed.varianceMinor))} (counted ${formatMinor(
                  justClosed.countedCashMinor ?? 0,
                )}, expected ${formatMinor(justClosed.expectedCashMinor ?? 0)}).`}
          </div>
        )}

        {open && totals ? (
          <Section
            title="Current session"
            description={`Opened ${dateTimeFmt.format(open.openedAt)} by ${openedByName}.`}
          >
            {hoursSince(open.openedAt, now) >= STALE_SESSION_HOURS && (
              <p className="lunia-card px-5 py-3 text-sm text-[#b42318]" role="alert">
                This drawer has been open for {hoursSince(open.openedAt, now)} hours. Count and close it, then open a new session for today.
              </p>
            )}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-testid="cash-live-totals">
              <StatCard label="Opening float" value={formatMinor(totals.openingFloatMinor)} />
              <StatCard label="Cash received" value={formatMinor(totals.cashInMinor)} subNote={`${totals.paymentCount} cash movements`} />
              <StatCard label="Cash refunded" value={formatMinor(totals.cashRefundsMinor)} />
              <StatCard label="Expected in drawer" value={formatMinor(totals.expectedCashMinor)} />
            </div>
            {untagged && untagged.count > 0 && (
              <p className="text-sm text-[var(--color-ink)]/70">
                {untagged.count} cash payment{untagged.count === 1 ? "" : "s"} ({formatMinor(untagged.amountMinor)}) since this drawer opened
                {untagged.count === 1 ? " is" : " are"} not linked to it and are not in the expected total.
              </p>
            )}
            <CloseSessionForm sessionId={open.id} expectedLabel={formatMinor(totals.expectedCashMinor)} />
          </Section>
        ) : (
          <OpenSessionForm />
        )}

        <Section title="History">
          <ResponsiveTable
            rows={history.filter((s) => s.closedAt)}
            rowKey={(s) => s.id}
            testId="cash-history"
            emptyMessage="No closed sessions yet."
            columns={[
              {
                key: "opened",
                header: "Session",
                render: (s) => (
                  <span className="flex flex-col">
                    <span>{dateTimeFmt.format(s.openedAt)}</span>
                    <span className="text-xs text-[var(--color-ink)]/55">
                      {s.openedBy}
                      {s.closedBy && s.closedBy !== s.openedBy ? ` / closed by ${s.closedBy}` : ""}
                    </span>
                  </span>
                ),
              },
              { key: "closed", header: "Closed", render: (s) => (s.closedAt ? dateTimeFmt.format(s.closedAt) : "") },
              { key: "float", header: "Float", align: "end", render: (s) => formatMinor(s.openingFloatMinor) },
              { key: "expected", header: "Expected", align: "end", render: (s) => formatMinor(s.expectedCashMinor ?? 0) },
              { key: "counted", header: "Counted", align: "end", render: (s) => formatMinor(s.countedCashMinor ?? 0) },
              {
                key: "variance",
                header: "Variance",
                align: "end",
                render: (s) => <Signed minor={s.varianceMinor ?? 0}>{formatMinor(s.varianceMinor ?? 0)}</Signed>,
              },
            ]}
          />
        </Section>
      </div>
    </AdminShell>
  );
}
