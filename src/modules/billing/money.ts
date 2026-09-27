// Pure VAT/money math for invoices, shared by the server (issuing, credit
// notes, ZATCA XML) and the admin line editor (live preview). Everything is
// integer halalas; no floats ever touch an amount.
//
// ROUNDING RULE (documented because tax authorities care):
//   1. Line net (excl. VAT) = unitPrice × qty − lineDiscount, exact integers.
//   2. An invoice-level discount (excl. VAT) is spread over the lines pro rata
//      to their net using the largest-remainder method, so the shares always
//      add up to the discount exactly.
//   3. Line VAT = round_half_up((lineNet − lineShareOfInvoiceDiscount) × rate),
//      rounded once per line to the halala (half away from zero).
//   4. Invoice VAT = Σ line VAT; invoice total = taxable amount + invoice VAT.
// Rounding per line (not per VAT category) is what keeps VAT-inclusive
// sticker prices exact: two 500.00 SAR services invoice as 1,000.00, not
// 999.99. The difference to category-level rounding is < 0.5 halala per line.
//
// VAT-INCLUSIVE PRICES: the catalog shows VAT-inclusive prices (required for
// consumer prices in KSA), but InvoiceLine.unitPriceMinor is stored EXCLUDING
// VAT. lineFromInclusive() back-computes an exclusive unit price + discount
// and pins the line total to the inclusive price (`grossMinor`). For ~87% of
// amounts an integer net exists with net + round(net × 15%) = gross exactly.
// For the rest (e.g. 125.00 SAR) no such net exists, so the line uses the
// "tax fraction" method instead: VAT = round(gross × 15/115), net = gross −
// VAT. That VAT is within one halala of round(net × 15%) and keeps the price
// the customer was quoted exact — computeLine() enforces the one-halala bound.

export const DEFAULT_VAT_RATE_BP = 1500;
const BP = 10_000;

/** num/den rounded half away from zero, using integer arithmetic only. */
export function divRoundHalfUp(num: number, den: number): number {
  if (!Number.isInteger(num) || !Number.isInteger(den) || den <= 0) {
    throw new Error("divRoundHalfUp expects integers and a positive denominator");
  }
  const sign = num < 0 ? -1 : 1;
  const a = Math.abs(num);
  const q = Math.floor(a / den);
  const r = a - q * den;
  return sign * (2 * r >= den ? q + 1 : q);
}

/** VAT on an exclusive amount, rounded half-up to the halala. */
export function vatOf(netMinor: number, vatRateBp: number): number {
  return divRoundHalfUp(netMinor * vatRateBp, BP);
}

/** Exclusive amount contained in a VAT-inclusive amount (rounded). */
export function exclusiveOf(grossMinor: number, vatRateBp: number): number {
  return divRoundHalfUp(grossMinor * BP, BP + vatRateBp);
}

/** Inclusive amount for an exclusive one (net + rounded VAT). */
export function inclusiveOf(netMinor: number, vatRateBp: number): number {
  return netMinor + vatOf(netMinor, vatRateBp);
}

export interface LineAmounts {
  qty: number;
  /** Unit price EXCLUDING VAT. */
  unitPriceMinor: number;
  /** Line discount EXCLUDING VAT. */
  discountMinor: number;
  vatRateBp: number;
  /**
   * VAT-inclusive line total to pin to (inclusive pricing). When set, the
   * line VAT is gross − net instead of round(net × rate); it must stay
   * within one halala of the latter.
   */
  grossMinor?: number;
}

export interface ComputedLine {
  netMinor: number;
  vatMinor: number;
  totalMinor: number;
}

function assertLine(line: LineAmounts): void {
  if (!Number.isInteger(line.qty) || line.qty <= 0) throw new Error("Quantity must be a positive whole number");
  if (!Number.isInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) throw new Error("Unit price must be zero or more");
  if (!Number.isInteger(line.discountMinor) || line.discountMinor < 0) throw new Error("Discount must be zero or more");
  if (!Number.isInteger(line.vatRateBp) || line.vatRateBp < 0 || line.vatRateBp > BP) throw new Error("Invalid VAT rate");
  if (line.discountMinor > line.unitPriceMinor * line.qty) throw new Error("Line discount exceeds the line amount");
}

/** Net, VAT and total of one line before any invoice-level discount. */
export function computeLine(line: LineAmounts): ComputedLine {
  assertLine(line);
  const netMinor = line.unitPriceMinor * line.qty - line.discountMinor;
  const exact = vatOf(netMinor, line.vatRateBp);
  if (line.grossMinor === undefined) return { netMinor, vatMinor: exact, totalMinor: netMinor + exact };
  const vatMinor = line.grossMinor - netMinor;
  if (Math.abs(vatMinor - exact) > 1) throw new Error("Line amounts are inconsistent with its VAT-inclusive total");
  return { netMinor, vatMinor, totalMinor: line.grossMinor };
}

/**
 * Converts a VAT-inclusive unit price/discount (what staff and the website
 * see) into the stored exclusive unit price + discount. The resulting line's
 * total equals `unitInclMinor × qty − discountInclMinor` exactly whenever an
 * integer net exists for it.
 */
export function lineFromInclusive(input: {
  unitInclMinor: number;
  qty: number;
  discountInclMinor?: number;
  vatRateBp: number;
}): { unitPriceMinor: number; discountMinor: number; grossMinor: number } {
  const { unitInclMinor, qty, vatRateBp } = input;
  const discountIncl = input.discountInclMinor ?? 0;
  const gross = unitInclMinor * qty - discountIncl;
  if (gross < 0) throw new Error("Line discount exceeds the line amount");

  // The net whose net + round(net × rate) hits the gross exactly (if any).
  const n0 = exclusiveOf(gross, vatRateBp);
  // Otherwise fall back to the tax-fraction split (net = gross − round(VAT
  // fraction)), which is n0 by construction.
  const net = [n0, n0 - 1, n0 + 1].find((n) => n >= 0 && inclusiveOf(n, vatRateBp) === gross) ?? n0;

  let unit = exclusiveOf(unitInclMinor, vatRateBp);
  let discount = unit * qty - net;
  if (discount < 0) {
    // Rounding pushed the exclusive unit a halala too low — take the next
    // unit up and absorb the (< qty halalas) remainder as a discount.
    unit = Math.ceil(net / qty);
    discount = unit * qty - net;
  }
  return { unitPriceMinor: unit, discountMinor: discount, grossMinor: gross };
}

export interface ComputedInvoiceLine extends ComputedLine {
  /** This line's share of the invoice-level discount (excl. VAT). */
  invoiceDiscountShareMinor: number;
  /** Net after the invoice-discount share — the VAT base. */
  taxableMinor: number;
  /** VAT on taxableMinor (what the invoice VAT total is summed from). */
  taxableVatMinor: number;
}

export interface VatGroup {
  vatRateBp: number;
  taxableMinor: number;
  vatMinor: number;
}

export interface InvoiceTotals {
  lines: ComputedInvoiceLine[];
  /** Σ line net (after line discounts), excl. VAT. */
  subtotalMinor: number;
  /** Invoice-level discount, excl. VAT. */
  discountMinor: number;
  /** subtotal − discount. */
  taxableMinor: number;
  vatMinor: number;
  totalMinor: number;
  groups: VatGroup[];
}

/** Largest-remainder split of `amount` across `weights` (non-negative ints). */
export function allocate(amount: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (amount === 0 || sum === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / sum);
  const floors = raw.map((x) => Math.floor(x));
  let left = amount - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]! += 1;
    left -= 1;
  }
  return floors;
}

export function computeInvoiceTotals(lines: LineAmounts[], invoiceDiscountMinor = 0): InvoiceTotals {
  if (!Number.isInteger(invoiceDiscountMinor) || invoiceDiscountMinor < 0) throw new Error("Invoice discount must be zero or more");
  const computed = lines.map(computeLine);
  const subtotalMinor = computed.reduce((s, l) => s + l.netMinor, 0);
  if (invoiceDiscountMinor > subtotalMinor) throw new Error("Invoice discount exceeds the subtotal");

  const shares = allocate(
    invoiceDiscountMinor,
    computed.map((l) => l.netMinor),
  );
  const out: ComputedInvoiceLine[] = computed.map((l, i) => {
    const share = shares[i]!;
    const taxableMinor = l.netMinor - share;
    // Undiscounted lines keep their own (possibly gross-pinned) VAT.
    const taxableVatMinor = share === 0 ? l.vatMinor : vatOf(taxableMinor, lines[i]!.vatRateBp);
    return { ...l, invoiceDiscountShareMinor: share, taxableMinor, taxableVatMinor };
  });

  const groupMap = new Map<number, VatGroup>();
  out.forEach((l, i) => {
    const rate = lines[i]!.vatRateBp;
    const g = groupMap.get(rate) ?? { vatRateBp: rate, taxableMinor: 0, vatMinor: 0 };
    g.taxableMinor += l.taxableMinor;
    g.vatMinor += l.taxableVatMinor;
    groupMap.set(rate, g);
  });

  const taxableMinor = subtotalMinor - invoiceDiscountMinor;
  const vatMinor = out.reduce((s, l) => s + l.taxableVatMinor, 0);
  return {
    lines: out,
    subtotalMinor,
    discountMinor: invoiceDiscountMinor,
    taxableMinor,
    vatMinor,
    totalMinor: taxableMinor + vatMinor,
    groups: [...groupMap.values()].sort((a, b) => b.vatRateBp - a.vatRateBp),
  };
}

/**
 * Exclusive invoice discount for a VAT-inclusive discount amount: picks the
 * exclusive value whose resulting invoice total is closest to
 * (Σ inclusive line totals − discountIncl), preferring the lower total on a
 * tie so the customer is never overcharged by rounding.
 */
export function invoiceDiscountFromInclusive(lines: LineAmounts[], discountInclMinor: number): number {
  if (discountInclMinor <= 0) return 0;
  const base = computeInvoiceTotals(lines, 0);
  if (base.totalMinor === 0) return 0;
  const target = base.totalMinor - discountInclMinor;
  const d0 = Math.round((discountInclMinor * base.subtotalMinor) / base.totalMinor);
  let best = { d: Math.min(Math.max(d0, 0), base.subtotalMinor), diff: Infinity, total: Infinity };
  for (let d = d0 - 3; d <= d0 + 3; d++) {
    if (d < 0 || d > base.subtotalMinor) continue;
    const total = computeInvoiceTotals(lines, d).totalMinor;
    const diff = Math.abs(total - target);
    if (diff < best.diff || (diff === best.diff && total < best.total)) best = { d, diff, total };
  }
  return best.d;
}

// --- Formatting / parsing ------------------------------------------------

/** "1,234.50" (Latin digits — invoices stay machine-readable in both languages). */
export function formatAmount(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  return `${sign}${whole}.${String(abs % 100).padStart(2, "0")}`;
}

/** "1,234.50 SAR". */
export function formatSarMinor(minor: number): string {
  return `${formatAmount(minor)} SAR`;
}

/** Plain decimal for XML ("1234.50"). */
export function toDecimal(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Parses "123", "123.4", "1,234.56" into halalas; null when not a valid amount. */
export function parseSarToMinor(input: string): number | null {
  const s = input.replace(/[,\s]/g, "").replace(/SAR/i, "");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/**
 * Inverse of lineFromInclusive for the editor: VAT-inclusive unit price and
 * discount that reproduce a stored line's total exactly
 * (unitIncl × qty − discountIncl = totalMinor).
 */
export function inclusiveEditorValues(line: { qty: number; unitPriceMinor: number; discountMinor: number; vatRateBp: number; totalMinor: number }): {
  unitInclMinor: number;
  discountInclMinor: number;
} {
  let unitInclMinor =
    line.qty === 1 && line.discountMinor === 0 ? line.totalMinor : inclusiveOf(line.unitPriceMinor, line.vatRateBp);
  if (unitInclMinor * line.qty < line.totalMinor) unitInclMinor = Math.ceil(line.totalMinor / line.qty);
  return { unitInclMinor, discountInclMinor: unitInclMinor * line.qty - line.totalMinor };
}
