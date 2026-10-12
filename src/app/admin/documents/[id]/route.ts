import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getStaffUserFromRequest } from "@/modules/iam/requestAuth";
import { getVisitDocument } from "@/modules/documents/documents";

// The ONLY way visit-document bytes leave storage: a signed-in staff user who
// can view bookings (the same gate as the Appointment Hub the documents live
// on). Responses are private/no-store and sandboxed so no shared cache keeps a
// copy and the file can't execute script if opened in a tab.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getStaffUserFromRequest(request);
  if (!user) return new NextResponse(null, { status: 401 });
  if (!user.permissions.has(PERMISSIONS.BOOKING_VIEW)) return new NextResponse(null, { status: 403 });

  const { id } = await context.params;
  const doc = await getVisitDocument(id);
  if (!doc) return new NextResponse(null, { status: 404 });

  let file;
  try {
    file = await storage.get(doc.storageKey);
  } catch {
    file = null;
  }
  if (!file) return new NextResponse(null, { status: 404 });

  // Quote-escape the file name for the Content-Disposition header.
  const safeName = doc.fileName.replace(/["\\]/g, "_");
  return new NextResponse(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
