import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";

// Media reads are intentionally public/unauthenticated: this serves images
// and other assets for the public website, not admin-only content.
export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await context.params;
  const key = segments.join("/");

  let result;
  try {
    result = await storage.get(key);
  } catch {
    // Unsafe/invalid key (e.g. traversal attempt) — treat as not found
    // rather than leaking details about the rejection.
    return new NextResponse(null, { status: 404 });
  }

  if (!result) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.data), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
