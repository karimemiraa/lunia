"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../_components/Modal";
import { toast } from "../_components/toast";
import { useConfirm } from "../_ui/ConfirmDialog";
import { searchClientsAction } from "../billing/actions";
import { enrolAction, savePlanAction, subscriptionAction } from "./actions";

export interface PlanDTO {
  id: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  priceMinor: number;
  serviceDiscountPct: number;
  productDiscountPct: number;
  includedSessions: number;
  includedServiceId: string | null;
  minTermMonths: number;
  graceDays: number;
  isActive: boolean;
  members: number;
}

export interface MemberDTO {
  id: string;
  clientProfileId: string;
  clientName: string;
  planName: string;
  priceMinor: number;
  status: string;
  periodLabel: string;
  monthStatus: string | null;
  invoiceId: string | null;
  cancelAtLabel: string | null;
}

const sar = (minor: number) => `${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} SAR`;
const STATUS_TONE: Record<string, "success" | "warning" | "neutral" | "danger"> = { ACTIVE: "success", PAST_DUE: "danger", PAUSED: "warning", CANCELLED: "neutral" };
const STATUS_LABEL: Record<string, string> = { ACTIVE: "Active", PAST_DUE: "Past due", PAUSED: "Paused", CANCELLED: "Cancelled" };

// ---- Plans ----------------------------------------------------------------------

function PlanForm({ plan, services, onDone }: { plan: PlanDTO | null; services: { id: string; nameEn: string }[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function submit(fd: FormData) {
    const num = (k: string) => Number(fd.get(k) ?? 0);
    start(async () => {
      setError(null);
      const r = await savePlanAction(plan?.id ?? null, {
        nameEn: String(fd.get("nameEn") ?? ""),
        nameAr: String(fd.get("nameAr") ?? ""),
        descriptionEn: String(fd.get("descriptionEn") ?? ""),
        descriptionAr: String(fd.get("descriptionAr") ?? ""),
        priceMinor: Math.round(num("priceSar") * 100),
        serviceDiscountPct: num("serviceDiscountPct"),
        productDiscountPct: num("productDiscountPct"),
        includedSessions: num("includedSessions"),
        includedServiceId: String(fd.get("includedServiceId") ?? "") || null,
        minTermMonths: num("minTermMonths") || 1,
        graceDays: num("graceDays"),
        isActive: fd.get("isActive") === "on",
      });
      if (r.ok) {
        toast({ title: plan ? "Plan saved" : "Plan created", tone: "success" });
        onDone();
        router.refresh();
      } else setError(r.error);
    });
  }
  const field = "flex flex-col gap-1 text-sm";
  return (
    <form action={submit} className="flex flex-col gap-4" data-testid="plan-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={field}>
          <span className="font-medium">Name (English)</span>
          <input name="nameEn" defaultValue={plan?.nameEn} required maxLength={80} className="lunia-input" />
        </label>
        <label className={field}>
          <span className="font-medium">Name (Arabic)</span>
          <input name="nameAr" defaultValue={plan?.nameAr} required maxLength={80} dir="rtl" className="lunia-input" />
        </label>
        <label className={field}>
          <span className="font-medium">Price per month (SAR)</span>
          <input name="priceSar" type="number" min={0} step="0.01" defaultValue={plan ? (plan.priceMinor / 100).toFixed(2) : ""} required className="lunia-input" />
        </label>
        <label className={field}>
          <span className="font-medium">Minimum term (months)</span>
          <input name="minTermMonths" type="number" min={1} max={36} defaultValue={plan?.minTermMonths ?? 1} className="lunia-input" />
        </label>
        <label className={field}>
          <span className="font-medium">Discount on treatments (%)</span>
          <input name="serviceDiscountPct" type="number" min={0} max={100} defaultValue={plan?.serviceDiscountPct ?? 0} className="lunia-input" />
        </label>
        <label className={field}>
          <span className="font-medium">Discount on products (%)</span>
          <input name="productDiscountPct" type="number" min={0} max={100} defaultValue={plan?.productDiscountPct ?? 0} className="lunia-input" />
        </label>
        <label className={field}>
          <span className="font-medium">Sessions included each month</span>
          <input name="includedSessions" type="number" min={0} max={50} defaultValue={plan?.includedSessions ?? 0} className="lunia-input" />
        </label>
        <label className={field}>
          <span className="font-medium">For which treatment</span>
          <select name="includedServiceId" defaultValue={plan?.includedServiceId ?? ""} className="lunia-input">
            <option value="">Any treatment</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameEn}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          <span className="font-medium">Grace period if unpaid (days)</span>
          <input name="graceDays" type="number" min={0} max={30} defaultValue={plan?.graceDays ?? 7} className="lunia-input" />
        </label>
      </div>
      <label className={field}>
        <span className="font-medium">What members get (English, shown to the customer)</span>
        <textarea name="descriptionEn" defaultValue={plan?.descriptionEn} maxLength={500} rows={2} className="lunia-input" />
      </label>
      <label className={field}>
        <span className="font-medium">What members get (Arabic)</span>
        <textarea name="descriptionAr" defaultValue={plan?.descriptionAr} maxLength={500} rows={2} dir="rtl" className="lunia-input" />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={plan?.isActive ?? true} className="h-4 w-4" />
        Offered to new members (existing members keep their plan either way)
      </label>
      <p className="text-xs text-[var(--color-ink)]/60">
        Included sessions are credited when a month is paid and can be redeemed at checkout as “Package session”; unused ones expire at the end of that month.
        Price changes apply from the next invoice.
      </p>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest w-fit min-h-11">
        {plan ? "Save plan" : "Create plan"}
      </button>
    </form>
  );
}

export function PlansSection({ plans, services, canEdit }: { plans: PlanDTO[]; services: { id: string; nameEn: string }[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<PlanDTO | "new" | null>(null);
  return (
    <section className="flex flex-col gap-3" data-testid="plans-section">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Plans</h2>
        {canEdit && (
          <button type="button" onClick={() => setEditing("new")} className="lunia-btn lunia-btn-forest lunia-btn-sm min-h-11" data-testid="new-plan">
            New plan
          </button>
        )}
      </div>
      {plans.length === 0 ? (
        <p className="lunia-card p-5 text-sm text-[var(--color-ink)]/65">No plans yet. Create one (e.g. “Glow Club — 499 SAR/month, 1 facial included, 10% off treatments”).</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <li key={p.id} className="lunia-card flex flex-col gap-2 p-4" data-testid="plan-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{p.nameEn}</p>
                  <p className="text-sm tabular-nums">{sar(p.priceMinor)} / month</p>
                </div>
                <span className="lunia-pill" data-tone={p.isActive ? "success" : "neutral"}>
                  {p.isActive ? "Offered" : "Not offered"}
                </span>
              </div>
              <ul className="text-xs text-[var(--color-ink)]/70">
                {p.serviceDiscountPct > 0 && <li>{p.serviceDiscountPct}% off treatments</li>}
                {p.productDiscountPct > 0 && <li>{p.productDiscountPct}% off products</li>}
                {p.includedSessions > 0 && <li>{p.includedSessions} session(s) included each month</li>}
                <li>
                  Minimum {p.minTermMonths} month{p.minTermMonths === 1 ? "" : "s"} · {p.graceDays} days to pay
                </li>
              </ul>
              <p className="mt-auto text-xs text-[var(--color-ink)]/60">
                {p.members} member{p.members === 1 ? "" : "s"}
              </p>
              {canEdit && (
                <button type="button" onClick={() => setEditing(p)} className="lunia-btn lunia-btn-ghost lunia-btn-sm w-fit min-h-11">
                  Edit
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <Modal title={editing === "new" ? "New membership plan" : `Edit “${editing.nameEn}”`} onClose={() => setEditing(null)} widthClass="max-w-2xl">
          <PlanForm plan={editing === "new" ? null : editing} services={services} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </section>
  );
}

// ---- Enrol ----------------------------------------------------------------------

export function EnrolForm({ plans, defaultClient }: { plans: { id: string; nameEn: string; priceMinor: number }[]; defaultClient?: { id: string; name: string } | null }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [client, setClient] = useState<{ id: string; name: string } | null>(defaultClient ?? null);
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      searchClientsAction(q).then((r) => live && setHits(r.map((h) => ({ id: h.id, name: h.name, phone: h.phone }))));
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  if (plans.length === 0) return <p className="text-sm text-[var(--color-ink)]/65">Create a plan first.</p>;

  const submit = () =>
    start(async () => {
      if (!client) return setError("Choose a customer.");
      setError(null);
      const r = await enrolAction({ clientProfileId: client.id, planId, startDate: startDate || undefined });
      if (r.ok) {
        toast({ title: r.message ?? "Enrolled", tone: "success" });
        setClient(defaultClient ?? null);
        setQuery("");
        router.refresh();
      } else setError(r.error);
    });

  return (
    <div className="flex flex-col gap-3" data-testid="enrol-form">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Customer</span>
          {client ? (
            <div className="flex min-h-11 items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] px-3">
              <span className="truncate">{client.name}</span>
              {!defaultClient && (
                <button type="button" onClick={() => setClient(null)} className="text-xs underline">
                  Change
                </button>
              )}
            </div>
          ) : (
            <div className="relative">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or phone" className="lunia-input w-full" data-testid="enrol-customer-search" />
              {query.trim().length >= 2 && hits.length > 0 && (
                <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-auto rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-md)]">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setClient({ id: h.id, name: h.name });
                          setHits([]);
                        }}
                        className="flex w-full justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-[var(--surface-2)]"
                        data-testid="enrol-customer-hit"
                      >
                        <span>{h.name}</span>
                        <span className="text-[var(--color-ink)]/55 tabular-nums">{h.phone}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Plan</span>
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="lunia-input" data-testid="enrol-plan">
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nameEn} — {sar(p.priceMinor)}/month
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Starts</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="lunia-input" />
          <span className="text-xs text-[var(--color-ink)]/55">Blank = today. Billed monthly from this date.</span>
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
      <button type="button" onClick={submit} disabled={pending} className="lunia-btn lunia-btn-forest w-fit min-h-11" data-testid="enrol-submit">
        Enrol and send first invoice
      </button>
    </div>
  );
}

// ---- Members ----------------------------------------------------------------------

function MemberActions({ m }: { m: MemberDTO }) {
  const router = useRouter();
  const [confirm, dialog] = useConfirm();
  const [pending, start] = useTransition();
  const run = (action: Parameters<typeof subscriptionAction>[1]) =>
    start(async () => {
      const r = await subscriptionAction(m.id, action);
      if (r.ok) {
        toast({ title: r.message ?? "Done", tone: "success" });
        router.refresh();
      } else toast({ title: r.error, tone: "error" });
    });
  if (m.status === "CANCELLED") return null;
  const btn = "lunia-btn lunia-btn-ghost lunia-btn-sm min-h-10";
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {dialog}
      {m.monthStatus === "DUE" && (
        <button type="button" disabled={pending} onClick={() => run("resend")} className={btn}>
          Resend invoice
        </button>
      )}
      {m.status === "PAUSED" ? (
        <button type="button" disabled={pending} onClick={() => run("resume")} className={btn} data-testid="member-resume">
          Resume
        </button>
      ) : (
        <button type="button" disabled={pending} onClick={() => run("pause")} className={btn} data-testid="member-pause">
          Pause
        </button>
      )}
      {m.cancelAtLabel ? (
        <button type="button" disabled={pending} onClick={() => run("keep")} className={btn}>
          Keep membership
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            if (await confirm({ title: "End this membership?", description: "It ends when the paid month (or the minimum term) is over. No further invoices after that.", confirmLabel: "End membership" })) run("cancel");
          }}
          className={btn}
          data-testid="member-cancel"
        >
          Cancel
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          if (await confirm({ title: "Cancel immediately?", description: "Benefits stop now. Any unpaid invoice stays open — issue a credit note if it shouldn't be paid.", confirmLabel: "Cancel now" })) run("cancelNow");
        }}
        className="lunia-btn lunia-btn-danger lunia-btn-sm min-h-10"
      >
        Cancel now
      </button>
    </div>
  );
}

export function MembersTable({ members }: { members: MemberDTO[] }) {
  if (members.length === 0) return <p className="lunia-card p-5 text-sm text-[var(--color-ink)]/65">No members yet.</p>;
  return (
    <div className="lunia-card overflow-x-auto">
      <table className="w-full text-left text-sm" data-testid="members-table">
        <thead className="text-xs uppercase tracking-[0.08em] text-[var(--color-ink)]/55">
          <tr>
            <th className="px-4 py-2 font-medium">Customer</th>
            <th className="px-4 py-2 font-medium">Plan</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Current month</th>
            <th className="px-4 py-2" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-t border-[var(--line)]" data-testid="member-row">
              <td className="px-4 py-2">
                <Link href={`/admin/clients/${m.clientProfileId}`} className="font-medium underline-offset-2 hover:underline">
                  {m.clientName}
                </Link>
              </td>
              <td className="px-4 py-2">
                {m.planName} <span className="text-[var(--color-ink)]/55 tabular-nums">· {sar(m.priceMinor)}</span>
              </td>
              <td className="px-4 py-2">
                <span className="lunia-pill" data-tone={STATUS_TONE[m.status] ?? "neutral"}>
                  {STATUS_LABEL[m.status] ?? m.status}
                </span>
                {m.cancelAtLabel && <p className="mt-1 text-xs text-[var(--color-ink)]/60">Ends {m.cancelAtLabel}</p>}
              </td>
              <td className="px-4 py-2 text-xs">
                <span className="tabular-nums">{m.periodLabel}</span>
                {m.invoiceId && (
                  <>
                    {" · "}
                    <Link href={`/admin/billing/${m.invoiceId}`} className="underline underline-offset-2">
                      {m.monthStatus === "PAID" ? "Paid" : "Unpaid invoice"}
                    </Link>
                  </>
                )}
              </td>
              <td className="px-4 py-2">
                <MemberActions m={m} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
