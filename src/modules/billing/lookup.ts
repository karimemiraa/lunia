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
      select: { id: true, nameEn: true, nameAr: true, priceMinor: true, vatRateBp: true, stockQty: true },
    }),
    prisma.servicePackage.findMany({
      where: { isActive: true, ...(term ? { OR: [{ nameEn: nameFilter }, { nameAr: { contains: term } }] } : {}) },
      take,
      select: { id: true, nameEn: true, nameAr: true, priceMinor: true },
    }),
  ]);
  const rate = settings.defaultVatRateBp;
  return [
    ...services.map((s) => ({ kind: "SERVICE" as const, id: s.id, name: s.nameEn, nameAr: s.nameAr, priceMinor: s.priceMinor, vatRateBp: rate })),
    ...products.map((p) => ({
      kind: "PRODUCT" as const,
      id: p.id,
      name: p.nameEn,
      nameAr: p.nameAr,
      priceMinor: settings.pricesIncludeVat ? inclusiveOf(p.priceMinor, p.vatRateBp) : p.priceMinor,
      vatRateBp: p.vatRateBp,
      stockQty: p.stockQty,
    })),
    ...packages.map((p) => ({ kind: "PACKAGE" as const, id: p.id, name: p.nameEn, nameAr: p.nameAr, priceMinor: p.priceMinor, vatRateBp: rate })),
  ];
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
