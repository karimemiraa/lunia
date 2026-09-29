// Small presentational helpers shared by the billing admin pages. Money,
// dates and status pills come from the shared _ui kit so invoices look like
// every other staff list.
import { StatusPill } from "../_ui/StatusPill";
import type { Step } from "../_ui/Layout";

export { formatDate, formatDateTime } from "../_ui/dates";

export function StatusBadge({ status, kind }: { status: string; kind?: string }) {
  return kind === "CREDIT_NOTE" ? <StatusPill status="CREDIT_NOTE" /> : <StatusPill status={status} />;
}

/** The front-desk checkout journey, shown on the editor and the issued view. */
export const POS_STEPS: Step[] = [{ label: "Build the sale" }, { label: "Issue" }, { label: "Take payment" }, { label: "Send receipt" }];

export const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  MADA: "mada",
  APPLE_PAY: "Apple Pay",
  BANK_TRANSFER: "Bank transfer",
  GIFT_CARD: "Gift card",
  PACKAGE: "Package session",
  ONLINE: "Online (pay link)",
  OTHER: "Other",
};
