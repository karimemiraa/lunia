"use server";

// Server actions for front-desk billing. Every action re-checks billing:manage
// itself; sensitive mutations (issue, void, payments, credit notes, sends,
// settings) are audited. Business rules live in src/modules/billing.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { recordAudit } from "@/modules/iam/audit";
import {
  BillingError,
  InsufficientStockError,
  createCreditNote,
  createDraft,
  issueInvoice,
  updateDraft,
  voidDraft,
  type CreditNoteInput,
  type DraftInput,
} from "@/modules/billing/invoices";
import { recordPayment, type RecordPaymentInput } from "@/modules/billing/settlement";
import { sendInvoice, type DeliveryChannel } from "@/modules/billing/delivery";
import { createPayLink } from "@/modules/billing/payments/links";
import { searchCatalog, searchClients, redeemablePackages, type CatalogHit, type ClientHit } from "@/modules/billing/lookup";
import { saveTaxSettings, type TaxSettings } from "@/modules/billing/settings";
import { formatSarMinor } from "@/modules/billing/money";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; stockShortage?: boolean };

function messageOf(err: unknown): string {
  if (err instanceof BillingError) return err.message;
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "Invalid input.";
  if (err instanceof Error && /Gift card|package|balance|expired|voided|redeemed/i.test(err.message)) return err.message;
  console.error("[billing action]", err);
  return "Something went wrong — please try again.";
}

function revalidate(id?: string) {
  revalidatePath("/admin/billing");
  if (id) revalidatePath(`/admin/billing/${id}`);
}

export async function saveDraftAction(invoiceId: string | null, input: DraftInput): Promise<ActionResult<{ id: string }>> {
  const user = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  try {
    const inv = invoiceId ? await updateDraft(invoiceId, input) : await createDraft(input, user.id);
    revalidate(inv.id);
    return { ok: true, id: inv.id };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function issueInvoiceAction(invoiceId: string, allowNegativeStock = false): Promise<ActionResult<{ number: string }>> {
  const user = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  try {
    const inv = await issueInvoice(invoiceId, { actorId: user.id, allowNegativeStock });
    await recordAudit({
      actorUserId: user.id,
      action: "billing.invoice.issue",
      entityType: "Invoice",
      entityId: inv.id,
      summary: `Issued ${inv.number} (${formatSarMinor(inv.totalMinor)})${allowNegativeStock ? " with stock override" : ""}`,
    });
    revalidate(inv.id);
    return { ok: true, number: inv.number };
  } catch (err) {
    return { ok: false, error: messageOf(err), stockShortage: err instanceof InsufficientStockError };
  }
}

export async function voidDraftAction(invoiceId: string): Promise<ActionResult> {
  const user = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  try {
    await voidDraft(invoiceId);
    await recordAudit({ actorUserId: user.id, action: "billing.invoice.void", entityType: "Invoice", entityId: invoiceId, summary: "Voided a draft invoice" });
    revalidate(invoiceId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function recordPaymentAction(input: RecordPaymentInput): Promise<ActionResult<{ changeMinor: number }>> {
  const user = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  try {
    const res = await recordPayment(input, { actorId: user.id, allowOverpay: false });
    await recordAudit({
      actorUserId: user.id,
      action: "billing.payment.record",
      entityType: "Invoice",
      entityId: res.invoice.id,
      summary: `${res.payment.method} payment of ${formatSarMinor(res.payment.amountMinor)} on ${res.invoice.number}`,
    });
    revalidate(res.invoice.id);
    return { ok: true, changeMinor: res.changeMinor };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function createCreditNoteAction(input: CreditNoteInput): Promise<ActionResult<{ id: string; number: string }>> {
  const user = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  try {
    const cn = await createCreditNote(input, { actorId: user.id });
    await recordAudit({
      actorUserId: user.id,
      action: "billing.creditnote.issue",
      entityType: "Invoice",
      entityId: cn.id,
      summary: `Credit note ${cn.number} (${formatSarMinor(cn.totalMinor)})${input.refund ? `, refund ${formatSarMinor(input.refund.amountMinor)} by ${input.refund.method}` : ""}: ${input.reason}`,
    });
    revalidate(input.originalInvoiceId);
    revalidate(cn.id);
    return { ok: true, id: cn.id, number: cn.number };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function sendInvoiceAction(
  invoiceId: string,
  channel: DeliveryChannel,
  includePayLink: boolean,
  locale: "ar" | "en",
): Promise<ActionResult<{ recipient?: string }>> {
  const user = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  const res = await sendInvoice(invoiceId, { channel, includePayLink, locale });
  if (!res.ok) return { ok: false, error: res.error ?? "Sending failed" };
  await recordAudit({
    actorUserId: user.id,
    action: "billing.invoice.send",
    entityType: "Invoice",
    entityId: invoiceId,
    summary: `Sent invoice by ${channel}${res.payLinkUrl ? " with pay link" : ""}`,
  });
  revalidate(invoiceId);
  return { ok: true, recipient: res.recipient };
}

export async function createPayLinkAction(invoiceId: string): Promise<ActionResult<{ url: string }>> {
  const user = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  try {
    const link = await createPayLink(invoiceId);
    await recordAudit({ actorUserId: user.id, action: "billing.paylink.create", entityType: "Invoice", entityId: invoiceId, summary: `Pay link for ${formatSarMinor(link.amountMinor)}` });
    revalidate(invoiceId);
    return { ok: true, url: link.url ?? "" };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}

export async function searchCatalogAction(q: string): Promise<CatalogHit[]> {
  await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  return searchCatalog(String(q).slice(0, 80));
}

export async function searchClientsAction(q: string): Promise<ClientHit[]> {
  await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  return searchClients(String(q).slice(0, 80));
}

export async function clientPackagesAction(clientProfileId: string) {
  await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  return redeemablePackages(clientProfileId);
}

// Seller/VAT identity is legal data printed on every invoice: editing it takes
// settings:manage or accounting:manage (owner, admin, finance), not the
// front-desk billing:manage that reception holds.
export async function saveTaxSettingsAction(value: TaxSettings): Promise<ActionResult> {
  const user = await requireAdmin(PERMISSIONS.BILLING_MANAGE);
  if (!user.permissions.has(PERMISSIONS.SETTINGS_MANAGE) && !user.permissions.has(PERMISSIONS.ACCOUNTING_MANAGE)) {
    return { ok: false, error: "You need settings or accounting access to change tax details." };
  }
  try {
    const saved = await saveTaxSettings(value);
    await recordAudit({
      actorUserId: user.id,
      action: "billing.settings.update",
      entityType: "SiteSetting",
      entityId: "tax",
      summary: `Tax settings saved (VAT ${saved.vatNumber || "unset"}, prices ${saved.pricesIncludeVat ? "incl." : "excl."} VAT)`,
    });
    revalidatePath("/admin/billing/settings");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: messageOf(err) };
  }
}
