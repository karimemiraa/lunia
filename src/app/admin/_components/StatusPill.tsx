// Semantic status pill. Server-safe (no hooks). Pass either a `tone`
// directly or a known domain status and let the map pick the tone, so every
// admin page colours "paid", "cancelled", "pending" the same way.

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

export function labelForStatus(status: string): string {
  const key = status.toUpperCase();
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, " ");
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
      {children ?? (status ? labelForStatus(status) : null)}
    </span>
  );
}
