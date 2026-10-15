// Semantic status pill. Server-safe (no hooks). Pass either a `tone`
// directly or a known domain status and let the map pick the tone, so every
// admin page colours "paid", "cancelled", "pending" the same way.

import { makeT, type StaffLocale } from "../_i18n/t";
import { translateStatus } from "../_ui/labels";
import { StatusText } from "../_ui/StatusText";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const STATUS_TONES: Record<string, StatusTone> = {
  // Bookings
  REQUESTED: "warning",
  CONFIRMED: "info",
  CHECKED_IN: "success",
  COMPLETED: "neutral",
  CANCELLED: "danger",
  NO_SHOW: "danger",
  // Invoices
  DRAFT: "neutral",
  ISSUED: "warning",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  VOID: "danger",
  // Generic
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  OPEN: "info",
  NO_ANSWER: "warning",
  DONE: "success",
  IN_PROGRESS: "warning",
  DECLINED: "neutral",
  EXPIRED: "neutral",
  REDEEMED: "neutral",
  ACTIVE: "success",
  INACTIVE: "neutral",
};

const STATUS_LABELS: Record<string, string> = {
  CHECKED_IN: "Checked in",
  NO_SHOW: "No-show",
  PARTIALLY_PAID: "Part-paid",
  NO_ANSWER: "No answer",
};

export function toneForStatus(status: string): StatusTone {
  return STATUS_TONES[status.toUpperCase()] ?? "neutral";
}

/** English label for a status; pass the staff locale for the Arabic label. */
export function labelForStatus(status: string, locale: StaffLocale = "en"): string {
  const key = status.toUpperCase();
  const label = STATUS_LABELS[key] ?? key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, " ");
  return locale === "en" ? label : translateStatus(label, makeT(locale));
}

interface StatusPillProps {
  status?: string;
  tone?: StatusTone;
  children?: React.ReactNode;
  className?: string;
}

export function StatusPill({ status, tone, children, className = "" }: StatusPillProps) {
  const resolvedTone = tone ?? (status ? toneForStatus(status) : "neutral");
  return (
    <span className={`lunia-pill ${className}`} data-tone={resolvedTone}>
      {typeof children === "string" ? <StatusText label={children} /> : (children ?? (status ? <StatusText label={labelForStatus(status)} /> : null))}
    </span>
  );
}
