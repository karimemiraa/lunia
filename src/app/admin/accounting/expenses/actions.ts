"use server";

// Server actions for the expense screens. Each re-checks accounting:manage
// itself (actions are reachable by direct POST) and audits the change.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireAccounting } from "../_components/access";
import { recordAudit } from "@/modules/iam/audit";
import { createExpense, deleteExpense, findOrCreateCategory, updateExpense, type ExpenseInput } from "@/modules/accounting/expenses";
import { checkReceiptFile, deleteReceipt, storeReceipt } from "@/modules/accounting/receipts";
import { formatMinor, parseSarToMinor } from "@/modules/accounting/periods";

export interface ExpenseFormState {
  error?: string;
}

const str = (formData: FormData, key: string) => {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
};

export async function saveExpenseAction(_prev: ExpenseFormState | null, formData: FormData): Promise<ExpenseFormState> {
  const user = await requireAccounting();
  const id = str(formData, "id").trim() || null;

  const amountMinor = parseSarToMinor(str(formData, "amount"));
  if (amountMinor === null) return { error: "Enter the amount excluding VAT, e.g. 1250.00." };
  const vatRaw = str(formData, "vat").trim();
  const vatMinor = vatRaw === "" ? 0 : parseSarToMinor(vatRaw);
  if (vatMinor === null) return { error: "Enter the VAT amount, e.g. 187.50, or 0." };

  let categoryId: string | null = str(formData, "categoryId").trim() || null;
  const newCategory = str(formData, "newCategory").trim();
  if (categoryId === "__new") {
    if (!newCategory) return { error: "Type a name for the new category." };
    categoryId = await findOrCreateCategory(newCategory);
  }

  const input: ExpenseInput = {
    categoryId,
    vendor: str(formData, "vendor"),
    description: str(formData, "description"),
    amountMinor,
    vatMinor,
    paidDateISO: str(formData, "paidDate"),
    method: str(formData, "method") as ExpenseInput["method"],
    reference: str(formData, "reference"),
  };

  // Receipt: validate before touching the DB, store, then roll the blob back
  // if the row can't be saved.
  let attachmentKey: string | null | undefined = undefined;
  const file = formData.get("receipt");
  if (file instanceof File && file.size > 0) {
    const check = checkReceiptFile(file);
    if (!check.ok) return { error: check.error };
    attachmentKey = await storeReceipt(Buffer.from(await file.arrayBuffer()), check.mimeType, check.ext);
  } else if (id && str(formData, "removeReceipt") === "on") {
    attachmentKey = null;
  }

  let savedId: string;
  try {
    if (id) {
      const updated = await updateExpense(id, input, { attachmentKey });
      savedId = updated.id;
    } else {
      const created = await createExpense(input, { createdById: user.id, attachmentKey: attachmentKey ?? null });
      savedId = created.id;
    }
  } catch (err) {
    if (attachmentKey) await deleteReceipt(attachmentKey);
    if (err instanceof ZodError) return { error: err.issues[0]?.message ?? "Check the form." };
    return { error: err instanceof Error ? err.message : "Could not save the expense." };
  }

  await recordAudit({
    actorUserId: user.id,
    action: id ? "expense.update" : "expense.create",
    entityType: "Expense",
    entityId: savedId,
    summary: `${id ? "Updated" : "Recorded"} expense "${input.description.trim()}" ${formatMinor(amountMinor)} + VAT ${formatMinor(vatMinor)}`,
  });

  revalidatePath("/admin/accounting/expenses");
  revalidatePath("/admin/accounting");
  redirect("/admin/accounting/expenses");
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const user = await requireAccounting();
  const id = str(formData, "id").trim();
  if (!id) return;
  const deleted = await deleteExpense(id);
  await recordAudit({
    actorUserId: user.id,
    action: "expense.delete",
    entityType: "Expense",
    entityId: id,
    summary: `Deleted expense "${deleted.description}" ${formatMinor(deleted.amountMinor)} + VAT ${formatMinor(deleted.vatMinor)}`,
  });
  revalidatePath("/admin/accounting/expenses");
  revalidatePath("/admin/accounting");
  redirect("/admin/accounting/expenses");
}
