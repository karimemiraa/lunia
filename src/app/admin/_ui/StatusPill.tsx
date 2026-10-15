import type { ReactNode } from "react";
import "./tokens.css";
import { makeT, type StaffLocale } from "../_i18n/t";
import { translateStatus } from "./labels";
import { StatusText } from "./StatusText";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-[var(--status-neutral-bg)] text-[var(--status-neutral-ink)]",
  info: "bg-[var(--status-info-bg)] text-[var(--status-info-ink)]",
  success: "bg-[var(--status-success-bg)] text-[var(--status-success-ink)]",
  warning: "bg-[var(--status-warning-bg)] text-[var(--status-warning-ink)]",
  danger: "bg-[var(--status-danger-bg)] text-[var(--status-danger-ink)]",
  accent: "bg-[var(--status-accent-bg)] text-[var(--status-accent-ink)]",
};

/** Maps the enum-ish statuses used across modules to a semantic tone. */
const STATUS_TONES: Record<string, Tone> = {
  // generic
  ACTIVE: "success",
  INACTIVE: "neutral",
  DRAFT: "neutral",
  PENDING: "warning",
  OPEN: "warning",
  DONE: "success",
  COMPLETED: "success",
  CANCELLED: "neutral",
  VOID: "danger",
  FAILED: "danger",
  ERROR: "danger",
  // billing
  ISSUED: "warning",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  CREDIT_NOTE: "accent",
  // inventory
  ORDERED: "info",
  PARTIAL: "warning",
  RECEIVED: "success",
  // hr
  APPROVED: "success",
  REJECTED: "danger",
  PRESENT: "success",
  ABSENT: "danger",
  LATE: "warning",
  LEAVE: "info",
  // assistant / callbacks
  BOOKED: "success",
  CALLBACK: "info",
  WHATSAPP: "info",
  LEAD: "warning",
  ABANDONED: "neutral",
  IN_PROGRESS: "info",
  NO_ANSWER: "warning",
  // comms
  SENT: "success",
  DELIVERED: "success",
  QUEUED: "info",
  SCHEDULED: "info",
  // reviews
  PUBLISHED: "success",
  HIDDEN: "neutral",
  // gift cards / packages
  REDEEMED: "neutral",
  EXPIRED: "neutral",
  VOIDED: "danger",
};

export function statusTone(status: string): Tone {
  return STATUS_TONES[status.toUpperCase()] ?? "neutral";
}

const LABELS: Record<string, string> = {
  ISSUED: "Unpaid",
  PARTIALLY_PAID: "Part paid",
  CREDIT_NOTE: "Credit note",
};

/** English label for a status; pass the staff locale for the Arabic label. */
export function statusLabel(status: string, locale: StaffLocale = "en"): string {
  const label = LABELS[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return locale === "en" ? label : translateStatus(label, makeT(locale));
}

interface StatusPillProps {
  /** Raw status (mapped to a tone + label) — or pass tone + children. */
  status?: string;
  tone?: Tone;
  children?: ReactNode;
  className?: string;
  /** Small dot before the text (for calm lists). */
  dot?: boolean;
}

export function StatusPill({ status, tone, children, className = "", dot }: StatusPillProps) {
  const t = tone ?? (status ? statusTone(status) : "neutral");
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide ${TONE_CLASS[t]} ${className}`}
    >
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {typeof children === "string" ? <StatusText label={children} /> : (children ?? (status ? <StatusText label={statusLabel(status)} /> : null))}
    </span>
  );
}
