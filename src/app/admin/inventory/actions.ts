"use server";

// Server actions for the inventory admin. Every action re-checks
// INVENTORY_MANAGE itself (never trusts the page that rendered the button),
// validates via the module's zod schemas, and audits stock-changing and
// purchasing mutations. Business logic lives in src/modules/inventory.

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import { createProduct, updateProduct, findProductByCode, type CreateProductInput, type ProductInput } from "@/modules/inventory/products";
import { adjustStock, postStockTake, previewStockTake, type AdjustmentInput, type StockTakeInput, type StockTakeVariance } from "@/modules/inventory/ledger";
import { createSupplier, updateSupplier, deleteSupplier, type SupplierInput } from "@/modules/inventory/suppliers";
import {
  createPurchaseOrder,
  updateDraftPurchaseOrder,
  markOrdered,
  cancelPurchaseOrder,
  receivePurchaseOrder,
  suggestReorder,
  type PoInput,
  type ReceiveInput,
  type ReorderSuggestion,
} from "@/modules/inventory/purchaseOrders";
import { setServiceConsumables, type ConsumablesInput } from "@/modules/inventory/consumables";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function messageOf(err: unknown): string {
  if (err instanceof ZodError) return err.issues[0]?.message ?? "Please check the form.";
  return err instanceof Error ? err.message : "Something went wrong.";
}

async function guard() {
  return requireAdmin(PERMISSIONS.INVENTORY_MANAGE);
}

function revalidateInventory() {
  revalidatePath("/admin/inventory", "layout");
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function createProductAction(input: CreateProductInput): Promise<ActionResult<{ id: string }>> {
  const user = await guard();
  try {
    const product = await createProduct(input, user.id);
    await recordAudit({ actorUserId: user.id, action: "inventory.product.create", entityType: "Product", entityId: product.id, summary: `Created product ${product.nameEn}` });
    revalidateInventory();
    return { ok: true, data: { id: product.id } };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function updateProductAction(id: string, input: ProductInput): Promise<ActionResult> {
  const user = await guard();
  try {
    const product = await updateProduct(id, input);
    await recordAudit({ actorUserId: user.id, action: "inventory.product.update", entityType: "Product", entityId: id, summary: `Updated product ${product.nameEn}` });
    revalidateInventory();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function findProductByCodeAction(code: string): Promise<ActionResult<{ id: string } | null>> {
  await guard();
  try {
    const product = await findProductByCode(String(code).slice(0, 64));
    return { ok: true, data: product ? { id: product.id } : null };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

// ---------------------------------------------------------------------------
// Stock
// ---------------------------------------------------------------------------

export async function adjustStockAction(input: AdjustmentInput): Promise<ActionResult> {
  const user = await guard();
  try {
    const movement = await adjustStock(input, user.id);
    if (movement) {
      await recordAudit({
        actorUserId: user.id,
        action: "inventory.stock.adjust",
        entityType: "Product",
        entityId: movement.productId,
        summary: `${movement.type} ${movement.qty > 0 ? "+" : ""}${movement.qty}: ${movement.note ?? ""}`.slice(0, 500),
      });
    }
    revalidateInventory();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function previewStockTakeAction(input: StockTakeInput): Promise<ActionResult<StockTakeVariance[]>> {
  await guard();
  try {
    return { ok: true, data: await previewStockTake(input) };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function postStockTakeAction(input: StockTakeInput): Promise<ActionResult<{ adjusted: number; counted: number; netValueMinor: number }>> {
  const user = await guard();
  try {
    const result = await postStockTake(input, user.id);
    await recordAudit({
      actorUserId: user.id,
      action: "inventory.stocktake.post",
      entityType: "StockTake",
      summary: `Stock-take: ${result.counted} counted, ${result.adjusted} adjusted, net ${result.netValueMinor / 100} SAR`,
    });
    revalidateInventory();
    return { ok: true, data: { adjusted: result.adjusted, counted: result.counted, netValueMinor: result.netValueMinor } };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export async function createSupplierAction(input: SupplierInput): Promise<ActionResult<{ id: string }>> {
  const user = await guard();
  try {
    const supplier = await createSupplier(input);
    await recordAudit({ actorUserId: user.id, action: "inventory.supplier.create", entityType: "Supplier", entityId: supplier.id, summary: `Created supplier ${supplier.name}` });
    revalidateInventory();
    return { ok: true, data: { id: supplier.id } };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function updateSupplierAction(id: string, input: SupplierInput): Promise<ActionResult> {
  const user = await guard();
  try {
    const supplier = await updateSupplier(id, input);
    await recordAudit({ actorUserId: user.id, action: "inventory.supplier.update", entityType: "Supplier", entityId: id, summary: `Updated supplier ${supplier.name}` });
    revalidateInventory();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function deleteSupplierAction(id: string): Promise<ActionResult> {
  const user = await guard();
  try {
    await deleteSupplier(id);
    await recordAudit({ actorUserId: user.id, action: "inventory.supplier.delete", entityType: "Supplier", entityId: id, summary: "Deleted supplier" });
    revalidateInventory();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

// ---------------------------------------------------------------------------
// Purchase orders
// ---------------------------------------------------------------------------

export async function suggestReorderAction(supplierId?: string): Promise<ActionResult<ReorderSuggestion[]>> {
  await guard();
  try {
    return { ok: true, data: await suggestReorder({ supplierId: supplierId || undefined }) };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function createPurchaseOrderAction(input: PoInput): Promise<ActionResult<{ id: string }>> {
  const user = await guard();
  try {
    const po = await createPurchaseOrder(input, user.id);
    await recordAudit({ actorUserId: user.id, action: "inventory.po.create", entityType: "PurchaseOrder", entityId: po.id, summary: `Created ${po.number}` });
    revalidateInventory();
    return { ok: true, data: { id: po.id } };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function updatePurchaseOrderAction(id: string, input: PoInput): Promise<ActionResult> {
  const user = await guard();
  try {
    const po = await updateDraftPurchaseOrder(id, input);
    await recordAudit({ actorUserId: user.id, action: "inventory.po.update", entityType: "PurchaseOrder", entityId: id, summary: `Edited draft ${po.number}` });
    revalidateInventory();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function markOrderedAction(id: string): Promise<ActionResult> {
  const user = await guard();
  try {
    const po = await markOrdered(id);
    await recordAudit({ actorUserId: user.id, action: "inventory.po.order", entityType: "PurchaseOrder", entityId: id, summary: `Marked ${po.number} as ordered` });
    revalidateInventory();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function cancelPurchaseOrderAction(id: string): Promise<ActionResult> {
  const user = await guard();
  try {
    const po = await cancelPurchaseOrder(id);
    await recordAudit({ actorUserId: user.id, action: "inventory.po.cancel", entityType: "PurchaseOrder", entityId: id, summary: `Cancelled ${po.number}` });
    revalidateInventory();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function receivePurchaseOrderAction(id: string, input: ReceiveInput): Promise<ActionResult> {
  const user = await guard();
  try {
    const po = await receivePurchaseOrder(id, input, user.id);
    const units = input.lines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
    await recordAudit({ actorUserId: user.id, action: "inventory.po.receive", entityType: "PurchaseOrder", entityId: id, summary: `Received ${units} units on ${po.number} (${po.status})` });
    revalidateInventory();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

// ---------------------------------------------------------------------------
// Service consumables (edited from the catalog service editor)
// ---------------------------------------------------------------------------

export async function setServiceConsumablesAction(input: ConsumablesInput): Promise<ActionResult> {
  const user = await guard();
  try {
    await setServiceConsumables(input);
    await recordAudit({
      actorUserId: user.id,
      action: "inventory.consumables.set",
      entityType: "Service",
      entityId: input.serviceId,
      summary: `Set ${input.items.length} consumable(s) per session`,
    });
    revalidatePath(`/admin/catalog/services/${input.serviceId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}
