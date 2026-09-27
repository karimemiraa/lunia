// View model for the printable invoice (staff print page + the customer's
// tokenized view): seller block, bilingual line names, VAT breakdown and the
// ZATCA QR rendered as inline SVG.

import { prisma } from "@/lib/db";
import { computeInvoiceTotals } from "./money";
import { getTaxSettings, type TaxSettings } from "./settings";
import { invoiceBalance } from "./settlement";
import { encodeQr, qrToSvg } from "./zatca/qrcode";

export interface InvoiceDocLine {
  id: string;
  nameEn: string;
  nameAr: string | null;
  qty: number;
  unitPriceMinor: number;
  discountMinor: number;
  vatRateBp: number;
  netMinor: number;
  vatMinor: number;
  totalMinor: number;
}

export interface InvoiceDocument {
  id: string;
  kind: "INVOICE" | "CREDIT_NOTE";
  number: string;
  status: string;
  issuedAt: Date | null;
  customerName: string;
  customerPhone: string | null;
  customerVatNumber: string | null;
  notes: string | null;
  seller: TaxSettings;
  lines: InvoiceDocLine[];
  groups: { vatRateBp: number; taxableMinor: number; vatMinor: number }[];
  subtotalMinor: number;
  discountMinor: number;
  vatMinor: number;
  totalMinor: number;
  paidMinor: number;
  balanceMinor: number;
  qrSvg: string | null;
  original: { number: string; issuedAt: Date | null } | null;
  clientProfileId: string | null;
}

export async function getInvoiceDocument(id: string): Promise<InvoiceDocument | null> {
  const inv = await prisma.invoice.findUnique({ where: { id }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  if (!inv) return null;

  const serviceIds = inv.lines.map((l) => l.serviceId).filter((x): x is string => !!x);
  const productIds = inv.lines.map((l) => l.productId).filter((x): x is string => !!x);
  const [seller, services, products, original, balance] = await Promise.all([
    getTaxSettings(),
    serviceIds.length ? prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, nameAr: true } }) : [],
    productIds.length ? prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, nameAr: true } }) : [],
    inv.originalInvoiceId
      ? prisma.invoice.findUnique({ where: { id: inv.originalInvoiceId }, select: { number: true, issuedAt: true } })
      : null,
    inv.kind === "INVOICE" && inv.status !== "DRAFT" && inv.status !== "VOID" ? invoiceBalance(prisma, inv) : null,
  ]);
  const arName = new Map<string, string | null>([...services, ...products].map((x) => [x.id, x.nameAr]));

  const totals = computeInvoiceTotals(
    inv.lines.map((l) => ({
      qty: l.qty,
      unitPriceMinor: l.unitPriceMinor,
      discountMinor: l.discountMinor,
      vatRateBp: l.vatRateBp,
      grossMinor: l.totalMinor,
    })),
    inv.discountMinor,
  );

  return {
    id: inv.id,
    kind: inv.kind === "CREDIT_NOTE" ? "CREDIT_NOTE" : "INVOICE",
    number: inv.status === "DRAFT" ? "DRAFT" : inv.number,
    status: inv.status,
    issuedAt: inv.issuedAt,
    customerName: inv.customerName,
    customerPhone: inv.customerPhone,
    customerVatNumber: inv.customerVatNumber,
    notes: inv.notes,
    seller,
    lines: inv.lines.map((l, i) => ({
      id: l.id,
      nameEn: l.description,
      nameAr: arName.get(l.serviceId ?? l.productId ?? "") ?? null,
      qty: l.qty,
      unitPriceMinor: l.unitPriceMinor,
      discountMinor: l.discountMinor,
      vatRateBp: l.vatRateBp,
      netMinor: totals.lines[i]!.netMinor,
      vatMinor: l.vatMinor,
      totalMinor: l.totalMinor,
    })),
    groups: totals.groups,
    subtotalMinor: inv.subtotalMinor,
    discountMinor: inv.discountMinor,
    vatMinor: inv.vatMinor,
    totalMinor: inv.totalMinor,
    paidMinor: inv.paidMinor,
    balanceMinor: balance ? Math.max(0, balance.balanceMinor) : 0,
    qrSvg: inv.zatcaQr ? qrToSvg(encodeQr(inv.zatcaQr), { title: "ZATCA QR" }) : null,
    original,
    clientProfileId: inv.clientProfileId,
  };
}
