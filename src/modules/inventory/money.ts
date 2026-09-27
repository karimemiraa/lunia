// Client-safe helpers (no server deps) shared by inventory pages and forms.

export const PRODUCT_KINDS = ["RETAIL", "CONSUMABLE", "BOTH"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const PRODUCT_UNITS = ["pcs", "ml", "g"] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export const PO_STATUSES = ["DRAFT", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

// Inventory costs are often fractional riyals (e.g. 12.50 per ml), so unlike
// the public site's formatSar this keeps two decimals.
export function formatSarMinor(minor: number): string {
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** "12.5" -> 1250. Returns null for blank/invalid/negative input. */
export function parseSarToMinor(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

export function minorToSarInput(minor: number): string {
  return (minor / 100).toFixed(2);
}

/**
 * Weighted average cost after receiving `inQty` units at `inCostMinor` on top
 * of `onHandQty` units valued at `currentCostMinor`. Negative on-hand stock
 * (consumed before it was received) carries no value, so it is treated as 0
 * and the new cost is simply the receipt cost.
 */
export function weightedAverageCost(onHandQty: number, currentCostMinor: number, inQty: number, inCostMinor: number): number {
  if (inQty <= 0) return currentCostMinor;
  const base = Math.max(onHandQty, 0);
  if (base === 0) return inCostMinor;
  return Math.round((base * currentCostMinor + inQty * inCostMinor) / (base + inQty));
}

/** Suggested reorder quantity: top the product up to twice its reorder level. */
export function reorderQty(stockQty: number, reorderLevel: number): number {
  return Math.max(reorderLevel * 2 - stockQty, 0);
}
