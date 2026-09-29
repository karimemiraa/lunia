"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { checkInAction } from "../../calendar/actions";
import { toast } from "../toast";

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
  const router = useRouter();
  const [pending, start] = useTransition();

  function checkIn() {
    start(async () => {
      const res = await checkInAction(bookingId);
      if (res.ok) {
        toast({ title: `${clientName} checked in`, tone: "success" });
        router.refresh();
      } else {
        toast({ title: "Could not check in", body: res.error, tone: "error" });
      }
    });
  }

  const link = "lunia-btn lunia-btn-ghost lunia-btn-sm";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {canManage && status === "CONFIRMED" && (
        <button type="button" onClick={checkIn} disabled={pending} aria-busy={pending} className="lunia-btn lunia-btn-forest lunia-btn-sm disabled:opacity-60">
          {pending ? "Checking in…" : "Check in"}
        </button>
      )}
      {canBill && (status === "CHECKED_IN" || status === "COMPLETED") && (
        <Link href={`/admin/billing/new?booking=${bookingId}`} className="lunia-btn lunia-btn-forest lunia-btn-sm">
          Checkout
        </Link>
      )}
      {canClinical && status !== "CANCELLED" && status !== "NO_SHOW" && (
        <Link href={`/admin/clients/${clientProfileId}/clinical/treatment`} className={link}>
          Treatment record
        </Link>
      )}
      {canViewCustomer && (
        <Link href={`/admin/clients/${clientProfileId}`} className={link}>
          Customer
        </Link>
      )}
    </div>
  );
}
