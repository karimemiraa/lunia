import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/modules/iam/rbac";
import { PERMISSIONS } from "@/modules/iam/permissions";

// Downloads an issued document's ZATCA UBL XML (billing:manage only).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser((await cookies()).get("lunia_session")?.value);
  if (!user || !user.permissions.has(PERMISSIONS.BILLING_MANAGE)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const inv = await prisma.invoice.findUnique({ where: { id }, select: { number: true, zatcaXml: true } });
  if (!inv?.zatcaXml) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(inv.zatcaXml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${inv.number}.xml"`,
      "Cache-Control": "no-store",
    },
  });
}
