import { AdminShell } from "../../../_components/AdminShell";
import { requireAccounting } from "../../_components/access";
import { ExpenseForm } from "../ExpenseForm";
import { EXPENSE_METHODS, METHOD_LABELS, listExpenseCategories } from "@/modules/accounting/expenses";
import { RECEIPT_ACCEPT } from "@/modules/accounting/receipts";
import { dateISOOf } from "@/modules/accounting/periods";

export default async function NewExpensePage() {
  const user = await requireAccounting();
  const categories = await listExpenseCategories();

  return (
    <AdminShell user={user} title="Record expense" description="Enter the amount before VAT and the VAT shown on the vendor's tax invoice.">
      <ExpenseForm
        categories={categories}
        methods={EXPENSE_METHODS.map((m) => ({ value: m, label: METHOD_LABELS[m] }))}
        receiptAccept={RECEIPT_ACCEPT}
        initial={{
          paidDate: dateISOOf(new Date()),
          categoryId: "",
          vendor: "",
          description: "",
          amount: "",
          vat: "",
          method: "BANK_TRANSFER",
          reference: "",
          hasReceipt: false,
        }}
      />
    </AdminShell>
  );
}
