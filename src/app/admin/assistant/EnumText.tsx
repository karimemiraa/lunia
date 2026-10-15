"use client";

import { useStaffLocale, useStaffT } from "../_i18n/StaffI18n";

// Enum values (chat outcomes, call-back statuses, filter values) shown on the
// assistant and call-back pages. English keeps the raw value ("IN PROGRESS",
// styled uppercase); Arabic shows the translated label.
const LABELS: Record<string, string> = {
  BOOKED: "Booked",
  CALLBACK: "Callback",
  WHATSAPP: "Whatsapp",
  LEAD: "Lead",
  ABANDONED: "Abandoned",
  IN_PROGRESS: "In progress",
  OPEN: "Still open",
  NO_ANSWER: "No answer",
  DONE: "Completed",
  CANCELLED: "Cancelled",
  ALL: "All",
};

export function EnumText({ value }: { value: string }) {
  const locale = useStaffLocale();
  const t = useStaffT();
  const en = value.replace(/_/g, " ");
  if (locale !== "ar") return <>{en}</>;
  const label = LABELS[value.toUpperCase()];
  return <>{label ? t(label) : en}</>;
}
