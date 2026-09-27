// Small presentational helpers shared by the billing admin pages.

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-[var(--color-ink)]/8 text-[var(--color-ink)]/65" },
  ISSUED: { label: "Unpaid", className: "bg-[var(--color-gold)]/25 text-[#7c6a2f]" },
  PARTIALLY_PAID: { label: "Part paid", className: "bg-[var(--color-gold)]/25 text-[#7c6a2f]" },
  PAID: { label: "Paid", className: "bg-[var(--color-teal)]/25 text-[var(--color-teal-ink)]" },
  VOID: { label: "Void", className: "bg-red-100 text-red-700" },
};

export function StatusBadge({ status, kind }: { status: string; kind?: string }) {
  const style =
    kind === "CREDIT_NOTE"
      ? { label: "Credit note", className: "bg-[var(--color-forest)]/12 text-[var(--color-forest)]" }
      : (STATUS_STYLE[status] ?? { label: status, className: "bg-[var(--color-ink)]/8" });
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}>{style.label}</span>
  );
}

const TZ = "Asia/Riyadh";

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, dateStyle: "medium" }).format(new Date(d));
}

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
