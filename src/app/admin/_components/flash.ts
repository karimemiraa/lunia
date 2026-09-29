import "server-only";
import { cookies } from "next/headers";
import { FLASH_COOKIE, encodeFlash, type ToastTone } from "./toast";

/**
 * Server -> client toast for server actions that then redirect or revalidate:
 *   await setFlash("Invoice issued"); redirect(`/admin/billing/${id}`);
 * The cookie is short-lived and readable by <Toaster/>, which shows it once
 * and clears it. Alternatively redirect with `?toast=${encodeFlash(...)}`.
 */
export async function setFlash(message: string, tone: ToastTone = "success"): Promise<void> {
  const jar = await cookies();
  jar.set(FLASH_COOKIE, encodeFlash(message, tone), {
    path: "/admin",
    maxAge: 30,
    sameSite: "lax",
    httpOnly: false,
  });
}

/** Builds a redirect target that shows a toast on arrival. */
export function withToast(href: string, message: string, tone: ToastTone = "success"): string {
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}toast=${encodeFlash(message, tone)}`;
}
