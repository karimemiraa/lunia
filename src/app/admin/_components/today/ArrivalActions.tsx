"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { checkInAction } from "../../calendar/actions";
import { toast } from "../toast";
import { useStaffT } from "../../_i18n/StaffI18n";

interface Props {
  bookingId: string;
  clientProfileId: string;
  clientName: string;
  status: string;
  canManage: boolean;
  canBill: boolean;
  canClinical: boolean;
  canViewCustomer: boolean;
}

// Per-arrival quick actions on the dashboard. Reuses the calendar's server
// actions (which re-check permissions) and refreshes the page on success.
export function ArrivalActions({ bookingId, clientProfileId, clientName, status, canManage, canBill, canClinical, canViewCustomer }: Props) {
  const t = useStaffT();
  const router = useRouter();
  const [pending, start] = useTransition();

  function checkIn() {
    start(async () => {
      const res = await checkInAction(bookingId);
      if (res.ok) {
        toast({ title: t("{name} checked in", { name: clientName }), tone: "success" });
        router.refresh();
      } else {
        toast({ title: t("Could not check in"), body: res.error && t(res.error), tone: "error" });
      }
    });
  }

  const link = "lunia-btn lunia-btn-ghost lunia-btn-sm";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canManage && status === "CONFIRMED" && (
        <button type="button" onClick={checkIn} disabled={pending} aria-busy={pending} className="lunia-btn lunia-btn-forest lunia-btn-sm disabled:opacity-60">
          {pending ? t("Checking in…") : t("Check in")}
        </button>
      )}
      {canBill && (status === "CHECKED_IN" || status === "COMPLETED") && (
        <Link href={`/admin/billing/new?booking=${bookingId}`} className="lunia-btn lunia-btn-forest lunia-btn-sm">
          {t("Checkout")}
        </Link>
      )}
      {canClinical && status !== "CANCELLED" && status !== "NO_SHOW" && (
        <Link href={`/admin/clients/${clientProfileId}/clinical/treatment`} className={link}>
          {t("Treatment record")}
        </Link>
      )}
      {canViewCustomer && (
        <Link href={`/admin/clients/${clientProfileId}`} className={link}>
          {t("Customer")}
        </Link>
      )}
    </div>
  );
}
