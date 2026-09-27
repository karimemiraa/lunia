import { notFound } from "next/navigation";
import { AdminShell } from "../../../_components/AdminShell";
import { ConfirmDeleteButton } from "../../../_components/ConfirmDeleteButton";
import { requireAccounting } from "../../_components/access";
import { ExpenseForm } from "../ExpenseForm";
import { deleteExpenseAction } from "../actions";
import { EXPENSE_METHODS, METHOD_LABELS, getExpense, listExpenseCategories } from "@/modules/accounting/expenses";
import { RECEIPT_ACCEPT } from "@/modules/accounting/receipts";
import { dateISOOf, minorToSarString } from "@/modules/accounting/periods";

interface EditExpensePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditExpensePage({ params }: EditExpensePageProps) {
  const user = await requireAccounting();
  const { id } = await params;
  const [expense, categories] = await Promise.all([getExpense(id), listExpenseCategories()]);
  if (!expense) notFound();

  // Keep a legacy method (e.g. GIFT_CARD) selectable if a row already uses it.
  const methods = EXPENSE_METHODS.includes(expense.method) ? EXPENSE_METHODS : [...EXPENSE_METHODS, expense.method];

  return (
    <AdminShell
      user={user}
      title="Edit expense"
      description={`Recorded ${dateISOOf(expense.createdAt)}.`}
      actions={
        <form action={deleteExpenseAction}>
          <input type="hidden" name="id" value={expense.id} />
          <ConfirmDeleteButton action={deleteExpenseAction} confirmMessage="Delete this expense and its receipt? This can't be undone." label="Delete expense" />
        </form>
      }
    >
      <ExpenseForm
        categories={categories}
        methods={methods.map((m) => ({ value: m, label: METHOD_LABELS[m] }))}
        receiptAccept={RECEIPT_ACCEPT}
        initial={{
          id: expense.id,
          paidDate: dateISOOf(expense.paidAt),
          categoryId: expense.categoryId ?? "",
          vendor: expense.vendor ?? "",
          description: expense.description,
          amount: minorToSarString(expense.amountMinor),
          vat: minorToSarString(expense.vatMinor),
          method: expense.method,
          reference: expense.reference ?? "",
          hasReceipt: Boolean(expense.attachmentKey),
        }}
      />
    </AdminShell>
  );
}
