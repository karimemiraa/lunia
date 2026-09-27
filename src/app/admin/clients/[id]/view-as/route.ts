import { NextResponse } from "next/server";
import { getStaffUserFromRequest } from "@/modules/iam/requestAuth";
import { CLIENT_SESSION_COOKIE } from "@/modules/iam/clientAuth";
import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_TTL_SECONDS,
  ImpersonationError,
  canImpersonate,
  startImpersonation,
} from "@/modules/iam/impersonation";

// "View as customer" (see modules/iam/impersonation.ts). A plain form POST
// with target="_blank" so the customer view opens in a new tab without a
// popup blocker getting involved. It sets the client-session cookie + the
// impersonation marker cookie, then redirects to the account page.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  // Only same-origin form posts (the staff cookie is SameSite=lax already;
  // this is belt and braces against cross-site form submission).
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new NextResponse("Forbidden", { status: 403 });

  const user = await getStaffUserFromRequest(request);
  if (!user) return new NextResponse(null, { status: 303, headers: { Location: "/admin/login" } });
  if (!canImpersonate(user.permissions)) return new NextResponse("You do not have permission to do this.", { status: 403 });

  const { id } = await context.params;
  let result;
  try {
    result = await startImpersonation({ actorUserId: user.id, actorPermissions: user.permissions, clientProfileId: id });
  } catch (err) {
    const message = err instanceof ImpersonationError ? err.message : "Could not open the customer view.";
    return new NextResponse(message, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  // Relative Location: behind the reverse proxy request.url carries the
  // container's internal host, not the public one.
  const res = new NextResponse(null, { status: 303, headers: { Location: `/${result.locale}/account` } });
  const cookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IMPERSONATION_TTL_SECONDS,
  };
  res.cookies.set(CLIENT_SESSION_COOKIE, result.sessionToken, cookie);
  res.cookies.set(IMPERSONATION_COOKIE, result.markerId, cookie);
  return res;
}
