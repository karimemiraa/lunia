import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { getStaffUserFromRequest } from "@/modules/iam/requestAuth";
import { getClinicalPhoto } from "@/modules/clinical/photos";

// The ONLY way clinical photo bytes leave storage: a signed-in staff user
// holding clinical:manage. Responses are private/no-store so no shared cache
// or the browser's disk cache keeps a copy.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getStaffUserFromRequest(request);
  if (!user) return new NextResponse(null, { status: 401 });
  if (!user.permissions.has(PERMISSIONS.CLINICAL_MANAGE)) return new NextResponse(null, { status: 403 });

  const { id } = await context.params;
  const photo = await getClinicalPhoto(id);
  if (!photo) return new NextResponse(null, { status: 404 });

  let file;
  try {
    file = await storage.get(photo.storageKey);
  } catch {
    file = null;
  }
  if (!file) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
