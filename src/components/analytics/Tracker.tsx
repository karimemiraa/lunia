"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Tiny, non-blocking, first-party page-view beacon for the public site. No
// PII: an anonymous random sessionId (localStorage), the current pathname,
// the referrer's host (server derives that from the full referrer we send;
// we never look at cookies or IPs here), and a whitelisted-looking source
// token from the URL. Honors Do-Not-Track / Global Privacy Control by doing
// nothing at all. Every failure mode is silent -- this must never affect
// the page it's mounted on.

const SESSION_STORAGE_KEY = "lunia_analytics_session_id";
const TRACK_ENDPOINT = "/api/track";

function isDoNotTrack(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  const win = typeof window !== "undefined" ? (window as unknown as { doNotTrack?: string }) : undefined;
  return navigator.doNotTrack === "1" || win?.doNotTrack === "1" || nav.globalPrivacyControl === true;
}

function getOrCreateSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(SESSION_STORAGE_KEY, id);
    return id;
  } catch {
    // localStorage unavailable (private mode, etc.) -- skip tracking rather
    // than generating a fresh id per call, which would pollute session stats.
    return null;
  }
}

function send(payload: Record<string, unknown>): void {
  try {
    const body = JSON.stringify(payload);
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(TRACK_ENDPOINT, blob)) return;
    }
    void fetch(TRACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never let analytics break the page.
  }
}

/**
 * Fire a funnel/interaction event (e.g. "booking_started",
 * "booking_completed") from any client component. Reuses the same anonymous
 * sessionId as the page-view tracker.
 */
export function trackEvent(name: string, meta?: Record<string, unknown>): void {
  try {
    if (isDoNotTrack()) return;
    const sessionId = getOrCreateSessionId();
    if (!sessionId) return;
    send({
      type: "event",
      name,
      path: window.location.pathname,
      sessionId,
      meta,
    });
  } catch {
    // Never let analytics break the caller.
  }
}

export function Tracker(): null {
  const pathname = usePathname();
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (lastTrackedPath.current === pathname) return;
    lastTrackedPath.current = pathname;

    try {
      if (isDoNotTrack()) return;
      const sessionId = getOrCreateSessionId();
      if (!sessionId) return;

      const params = new URLSearchParams(window.location.search);
      const source = params.get("utm_source") ?? params.get("src") ?? undefined;

      send({
        type: "pageview",
        path: pathname,
        referrer: document.referrer || undefined,
        source,
        sessionId,
      });
    } catch {
      // Never let analytics break the page.
    }
  }, [pathname]);

  return null;
}
