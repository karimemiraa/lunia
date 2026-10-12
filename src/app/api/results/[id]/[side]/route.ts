import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";
import { getPublicShowcasePhoto } from "@/modules/clinical/showcase";

// Public before/after gallery images. A clinical photo is served here ONLY
// while it belongs to a published ResultShowcase AND both photos of the pair
// carry the customer's recorded consent (checked per request in
// getPublicShowcasePhoto). Everything else under clinical/ stays private
// (admin route /admin/clinical/photo/[id]). Short cache so unpublishing or a
// withdrawn consent takes effect within minutes.
export async function GET(_request: Request, context: { params: Promise<{ id: string; side: string }> }) {
  const { id, side } = await context.params;
  if (side !== "before" && side !== "after") return new NextResponse(null, { status: 404 });
  const photo = await getPublicShowcasePhoto(id, side);
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
      "Cache-Control": "public, max-age=300, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
