import { NextResponse } from "next/server";
import { storage } from "@/lib/storage";

// Media reads are intentionally public/unauthenticated: this serves images
// and other assets for the public website, not admin-only content.
// Parses a single "bytes=start-end" range (the only form browsers send for
// media). Returns null for anything we can't satisfy, which falls back to a
// full 200 response.
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    // Suffix range: the last N bytes.
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start > end || start >= size) return null;
  return { start, end };
}

export async function GET(
  request: Request,
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

  const size = result.data.length;
  const baseHeaders = {
    "Content-Type": result.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
    // Defense in depth against stored-XSS via uploaded media (e.g. an SVG
    // that slipped through upload validation, or any other risky type):
    // nosniff stops browsers from MIME-sniffing content into an
    // executable type, and the sandboxed "default-src 'none'" CSP blocks
    // scripts/plugins/frames even if a browser did render it as HTML/SVG.
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  };

  // Byte-range support: iOS Safari refuses to play <video> from a server that
  // ignores Range (it probes with bytes=0-1 and expects a 206), which left the
  // CMS hero film blank on iPhones.
  const rangeHeader = request.headers.get("range");
  if (rangeHeader) {
    const range = parseRange(rangeHeader, size);
    if (!range) {
      return new NextResponse(null, { status: 416, headers: { ...baseHeaders, "Content-Range": `bytes */${size}` } });
    }
    const chunk = result.data.subarray(range.start, range.end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
        "Content-Length": String(chunk.length),
      },
    });
  }

  return new NextResponse(new Uint8Array(result.data), {
    status: 200,
    headers: { ...baseHeaders, "Content-Length": String(size) },
  });
}
