import { NextResponse } from "next/server";
import { requireAccounting } from "../../../_components/access";
import { prisma } from "@/lib/db";
import { storage } from "@/lib/storage";

// GET /admin/accounting/expenses/[id]/receipt
//
// The only way to read an expense receipt: permission-checked, looked up via
// the expense row (never a caller-supplied storage key), and never cached by
// shared caches. /api/media refuses the private "finance/" prefix.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await requireAccounting();
  const { id } = await context.params;

  const expense = await prisma.expense.findUnique({ where: { id }, select: { attachmentKey: true } });
  if (!expense?.attachmentKey) return new NextResponse(null, { status: 404 });

  let file;
  try {
    file = await storage.get(expense.attachmentKey);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
  if (!file) return new NextResponse(null, { status: 404 });

  const filename = expense.attachmentKey.split("/").pop() ?? "receipt";
  return new NextResponse(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `inline; filename="receipt-${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // PDFs need the browser's viewer; everything else stays inert.
      "Content-Security-Policy": file.contentType === "application/pdf" ? "default-src 'none'; object-src 'self'" : "default-src 'none'; img-src 'self'; sandbox",
    },
  });
}
