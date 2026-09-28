// Lookups for the front-desk invoice editor: catalog items to add as lines,
// customers to bill, and a customer's redeemable packages.
//
// Prices are returned the way the editor enters them: services and packages
// as listed in the catalog (VAT-inclusive when the "prices include VAT"
// setting is on), products converted to inclusive from their stored
// exclusive price when that setting is on.

import { prisma } from "@/lib/db";
import { inclusiveOf } from "./money";
import { getTaxSettings } from "./settings";

export interface CatalogHit {
  kind: "SERVICE" | "PRODUCT" | "PACKAGE";
  id: string;
  name: string;
  nameAr: string | null;
  /** Unit price as the editor should prefill it. */
  priceMinor: number;
  vatRateBp: number;
  stockQty?: number;
}

export async function searchCatalog(q: string, take = 12): Promise<CatalogHit[]> {
  const term = q.trim();
  const settings = await getTaxSettings();
  const nameFilter = term ? { contains: term, mode: "insensitive" as const } : undefined;
  const [services, products, packages] = await Promise.all([
    prisma.service.findMany({
      where: term ? { OR: [{ nameEn: nameFilter }, { nameAr: { contains: term } }] } : {},
      orderBy: { order: "asc" },
      take,
      select: { id: true, nameEn: true, nameAr: true, priceMinor: true },
    }),
    prisma.product.findMany({
      where: {
        isActive: true,
        kind: { in: ["RETAIL", "BOTH"] },
        ...(term ? { OR: [{ nameEn: nameFilter }, { nameAr: { contains: term } }, { sku: nameFilter }, { barcode: term }] } : {}),
      },
      orderBy: { nameEn: "asc" },
      take,
      select: { id: true, nameEn: true, nameAr: true, priceMinor: true, vatRateBp: true, stockQty: true, barcode: true },
    }),
    prisma.servicePackage.findMany({
      where: { isActive: true, ...(term ? { OR: [{ nameEn: nameFilter }, { nameAr: { contains: term } }] } : {}) },
      take,
      select: { id: true, nameEn: true, nameAr: true, priceMinor: true },
    }),
  ]);
  const rate = settings.defaultVatRateBp;
  const hits: CatalogHit[] = [
    ...services.map((s) => ({ kind: "SERVICE" as const, id: s.id, name: s.nameEn, nameAr: s.nameAr, priceMinor: s.priceMinor, vatRateBp: rate })),
    ...products.map((p) => productHit(p, settings)),
    ...packages.map((p) => ({ kind: "PACKAGE" as const, id: p.id, name: p.nameEn, nameAr: p.nameAr, priceMinor: p.priceMinor, vatRateBp: rate })),
  ];
  // A scanned barcode must resolve to its product first, so Enter in the POS
  // scan box adds the right thing even when a service name also matches.
  const scanned = term ? products.find((p) => p.barcode === term) : undefined;
  if (scanned) {
    const i = hits.findIndex((h) => h.kind === "PRODUCT" && h.id === scanned.id);
    if (i > 0) hits.unshift(...hits.splice(i, 1));
  }
  return hits;
}

type ProductRow = { id: string; nameEn: string; nameAr: string | null; priceMinor: number; vatRateBp: number; stockQty: number };

function productHit(p: ProductRow, settings: { pricesIncludeVat: boolean }): CatalogHit {
  return {
    kind: "PRODUCT",
    id: p.id,
    name: p.nameEn,
    nameAr: p.nameAr,
    priceMinor: settings.pricesIncludeVat ? inclusiveOf(p.priceMinor, p.vatRateBp) : p.priceMinor,
    vatRateBp: p.vatRateBp,
    stockQty: p.stockQty,
  };
}

/**
 * Quick tiles for the POS: the services/products sold most in the last 90
 * days, padded with the first catalog services when history is thin.
 */
export async function quickPicks(take = 8): Promise<CatalogHit[]> {
  const settings = await getTaxSettings();
  const since = new Date(Date.now() - 90 * 86_400_000);
  const top = await prisma.invoiceLine.groupBy({
    by: ["kind", "serviceId", "productId"],
    where: { kind: { in: ["SERVICE", "PRODUCT"] }, invoice: { kind: "INVOICE", status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] }, issuedAt: { gte: since } } },
    _sum: { qty: true },
    orderBy: { _sum: { qty: "desc" } },
    take,
  });
  const serviceIds = top.map((t) => t.serviceId).filter((x): x is string => !!x);
  const productIds = top.map((t) => t.productId).filter((x): x is string => !!x);
  const [services, products, fill] = await Promise.all([
    serviceIds.length ? prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, nameEn: true, nameAr: true, priceMinor: true } }) : [],
    productIds.length
      ? prisma.product.findMany({ where: { id: { in: productIds }, isActive: true }, select: { id: true, nameEn: true, nameAr: true, priceMinor: true, vatRateBp: true, stockQty: true } })
      : [],
    prisma.service.findMany({ where: { isPublished: true }, orderBy: { order: "asc" }, take, select: { id: true, nameEn: true, nameAr: true, priceMinor: true } }),
  ]);
  const rate = settings.defaultVatRateBp;
  const out: CatalogHit[] = [];
  for (const t of top) {
    if (t.serviceId) {
      const s = services.find((x) => x.id === t.serviceId);
      if (s) out.push({ kind: "SERVICE", id: s.id, name: s.nameEn, nameAr: s.nameAr, priceMinor: s.priceMinor, vatRateBp: rate });
    } else if (t.productId) {
      const p = products.find((x) => x.id === t.productId);
      if (p) out.push(productHit(p, settings));
    }
  }
  for (const s of fill) {
    if (out.length >= take) break;
    if (!out.some((h) => h.kind === "SERVICE" && h.id === s.id)) out.push({ kind: "SERVICE", id: s.id, name: s.nameEn, nameAr: s.nameAr, priceMinor: s.priceMinor, vatRateBp: rate });
  }
  return out.slice(0, take);
}

export interface ClientHit {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export async function searchClients(q: string, take = 8): Promise<ClientHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const rows = await prisma.clientProfile.findMany({
    where: {
      OR: [
        { fullName: { contains: term, mode: "insensitive" } },
        { user: { phone: { contains: term.replace(/\s/g, "") } } },
        { user: { email: { contains: term, mode: "insensitive" } } },
      ],
    },
    take,
    orderBy: { createdAt: "desc" },
    select: { id: true, fullName: true, user: { select: { phone: true, email: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.fullName, phone: r.user.phone, email: r.user.email }));
}

/** Active package purchases a customer can redeem a session from. */
export async function redeemablePackages(clientProfileId: string) {
  const rows = await prisma.packagePurchase.findMany({
    where: { clientProfileId, status: "ACTIVE", sessionsRemaining: { gt: 0 } },
    include: { package: { select: { nameEn: true, sessionsTotal: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.package.nameEn, sessionsRemaining: r.sessionsRemaining, sessionsTotal: r.package.sessionsTotal }));
}
