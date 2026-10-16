"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BoardCard } from "@/modules/booking/journey";
import { useStaffT } from "../_i18n/StaffI18n";
import { toast } from "../_components/toast";
import { decideDiscountAction, giveDiscountAction, removeDiscountAction } from "./actions";

export type DiscountCard = Pick<BoardCard, "appointmentId" | "priceMinor" | "discount" | "invoiceIssued">;

const sarText = (minor: number) => (minor / 100).toFixed(minor % 100 === 0 ? 0 : 2);

/**
 * Specialist discount on a visit card: shows the current discount (or the
 * request waiting for a manager) and lets her give one — % or SAR, with a
 * reason. Managers approve/decline requests above the cap here too.
 */
export function DiscountControl({ card: c, mine, canGive, canApprove, reasons }: { card: DiscountCard; mine: boolean; canGive: boolean; canApprove: boolean; reasons: readonly string[] }) {
  const t = useStaffT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState<"pct" | "sar">("pct");
  const [reason, setReason] = useState(reasons[0] ?? "");
  const [other, setOther] = useState("");
  const allowed = canApprove || (canGive && mine);
  const d = c.discount;
  if (!d && (!allowed || c.invoiceIssued || c.priceMinor <= 0)) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; pending?: boolean }>, done: (r: { pending?: boolean }) => string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast({ title: done(r), tone: "success" });
        setOpen(false);
        router.refresh();
      } else toast({ title: t("Could not save the discount"), body: r.error, tone: "error" });
    });

  const pct = (d?.pctBp ?? 0) / 100;
  const ghost = "lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11 disabled:opacity-60";
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--line)] pt-2" data-testid="visit-discount" data-discount-status={d?.status ?? "NONE"}>
      {d && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className={`rounded-full px-2 py-0.5 font-medium ${d.status === "PENDING" ? "bg-[var(--status-warning-bg)] text-[var(--status-warning-ink)]" : "bg-[var(--status-success-bg)] text-[var(--status-success-ink)]"}`}>
            {d.status === "PENDING" ? t("Discount {pct}% waiting for approval", { pct }) : t("Discount {pct}% ({amount} SAR)", { pct, amount: sarText(d.amountMinor) })}
          </span>
          <span className="text-[var(--color-ink)]/60">{t(d.reason)}</span>
        </div>
      )}
      {d?.status === "PENDING" && canApprove && !c.invoiceIssued && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="lunia-btn lunia-btn-forest lunia-btn-sm min-h-11" disabled={pending} onClick={() => run(() => decideDiscountAction(c.appointmentId, true), () => t("Discount approved"))}>{t("Approve")}</button>
          <button type="button" className={ghost} disabled={pending} onClick={() => run(() => decideDiscountAction(c.appointmentId, false), () => t("Discount declined"))}>{t("Decline")}</button>
        </div>
      )}
      {d && allowed && !c.invoiceIssued && (
        <button type="button" className="self-start text-xs text-[var(--color-ink)]/55 underline-offset-2 hover:underline" disabled={pending} onClick={() => run(() => removeDiscountAction(c.appointmentId), () => t("Discount removed"))}>
          {t("Remove discount")}
        </button>
      )}
      {!d && allowed && !open && (
        <button type="button" className={`${ghost} self-start`} onClick={() => setOpen(true)} data-testid="give-discount">{t("Give a discount")}</button>
      )}
      {!d && open && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(value.replace(",", "."));
            const why = reason === "__other" ? other : reason;
            run(
              () => giveDiscountAction(c.appointmentId, unit === "pct" ? { pct: n } : { amountMinor: Math.round(n * 100) }, why),
              (r) => (r.pending ? t("Sent to a manager for approval") : t("Discount added — it will be on the invoice")),
            );
          }}
        >
          <div className="flex items-center gap-1.5">
            <input
              inputMode="decimal"
              dir="ltr"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-label={t("Discount")}
              placeholder={unit === "pct" ? "10" : "50"}
              className="lunia-input min-h-11 w-20 text-end tabular-nums"
              data-testid="discount-value"
            />
            <div className="flex rounded-full bg-[var(--surface-2)] p-0.5" role="group" aria-label={t("Discount type")}>
              {(["pct", "sar"] as const).map((u) => (
                <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)} className={`min-h-10 rounded-full px-3 text-xs font-medium ${unit === u ? "bg-[var(--surface)] shadow-sm" : "text-[var(--color-ink)]/60"}`}>
                  {u === "pct" ? "%" : t("SAR")}
                </button>
              ))}
            </div>
          </div>
          <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t("Reason")} className="lunia-input min-h-11 text-sm" data-testid="discount-reason">
            {reasons.map((r) => <option key={r} value={r}>{t(r)}</option>)}
            <option value="__other">{t("Other reason…")}</option>
          </select>
          {reason === "__other" && (
            <input required value={other} onChange={(e) => setOther(e.target.value)} aria-label={t("Reason")} placeholder={t("Why?")} className="lunia-input min-h-11 text-sm" />
          )}
          <div className="flex gap-1.5">
            <button type="submit" className="lunia-btn lunia-btn-forest lunia-btn-sm min-h-11" disabled={pending} data-testid="discount-save">{t("Save discount")}</button>
            <button type="button" className={ghost} onClick={() => setOpen(false)}>{t("Cancel")}</button>
          </div>
        </form>
      )}
    </div>
  );
}
