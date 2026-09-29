// Tiny toast bus. `toast()` can be called from any client component (event
// handlers, transitions) without a provider; <Toaster/> in AdminShell listens.
// Server actions use setFlash() (flash.ts) or redirect with `?toast=`.

export type ToastTone = "success" | "error" | "info" | "warning";

export interface ToastInput {
  title: string;
  body?: string;
  tone?: ToastTone;
  /** ms before auto-dismiss (default 4000). */
  duration?: number;
}

export const TOAST_EVENT = "lunia:toast";
export const FLASH_COOKIE = "lunia_flash";

export function toast(input: ToastInput | string): void {
  if (typeof window === "undefined") return;
  const detail: ToastInput = typeof input === "string" ? { title: input } : input;
  window.dispatchEvent(new CustomEvent<ToastInput>(TOAST_EVENT, { detail }));
}

/** Hook-shaped API for components; stable functions, no context needed. */
export function useToast() {
  return {
    toast,
    success: (title: string, body?: string) => toast({ title, body, tone: "success" }),
    error: (title: string, body?: string) => toast({ title, body, tone: "error" }),
    info: (title: string, body?: string) => toast({ title, body, tone: "info" }),
  };
}

/** Encodes a flash message for the cookie / query string. */
export function encodeFlash(message: string, tone: ToastTone = "success"): string {
  return encodeURIComponent(JSON.stringify({ t: message, k: tone }));
}

export function decodeFlash(raw: string): ToastInput | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { t?: unknown; k?: unknown };
    if (typeof parsed.t !== "string" || !parsed.t) return null;
    const tone = typeof parsed.k === "string" && ["success", "error", "info", "warning"].includes(parsed.k) ? (parsed.k as ToastTone) : "success";
    return { title: parsed.t.slice(0, 200), tone };
  } catch {
    // A plain, unencoded string (e.g. a hand-written ?toast=Saved) still works.
    const plain = raw.trim();
    return plain ? { title: plain.slice(0, 200), tone: "success" } : null;
  }
}
