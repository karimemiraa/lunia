"use client";

import { useEffect, useRef, useState } from "react";
import { myWaitingCustomersAction } from "../visits/actions";
import { useStaffT } from "../_i18n/StaffI18n";
import { toast } from "./toast";

// "Your customer has arrived" for the signed-in specialist: polls who is
// waiting for her, and for each NEW arrival plays a soft chime, shows a toast
// linking to the visit board, and (if she allowed it) a browser/phone
// notification. Nothing leaves the system. Mounted once in the admin layout.

const POLL_MS = 20_000;
const SEEN_KEY = "lunia_arrivals_seen";

function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    // Two soft notes (E5 → A5), short and quiet — a reception bell, not an alarm.
    [659.25, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.65);
    });
    window.setTimeout(() => void ctx.close(), 1500);
  } catch {
    /* audio blocked until the first tap — the toast still shows */
  }
}

function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(window.sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function ArrivalAlerts() {
  const t = useStaffT();
  const first = useRef(true);

  useEffect(() => {
    let stopped = false;
    async function poll() {
      if (document.visibilityState !== "visible" && !first.current) return;
      let waiting: Awaited<ReturnType<typeof myWaitingCustomersAction>>;
      try {
        waiting = await myWaitingCustomersAction();
      } catch {
        return;
      }
      if (stopped) return;
      const seen = readSeen();
      const fresh = waiting.filter((w) => !seen.has(w.bookingId));
      // On page load, remember who is already waiting without alerting again.
      if (!first.current && fresh.length > 0) {
        chime();
        for (const w of fresh) {
          const title = t("{name} has arrived", { name: t(w.clientName) });
          toast({ title, body: t("She is waiting for you. Open the visit board to receive her."), tone: "info" });
          if ("Notification" in window && Notification.permission === "granted") {
            try {
              new Notification(title, { body: t("She is waiting for you."), tag: `arrival-${w.bookingId}` });
            } catch {
              /* some mobile browsers only allow notifications from a service worker */
            }
          }
        }
      }
      first.current = false;
      try {
        window.sessionStorage.setItem(SEEN_KEY, JSON.stringify(waiting.map((w) => w.bookingId)));
      } catch {
        /* private mode */
      }
    }
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [t]);

  return null;
}

/** "Turn on arrival alerts" — asks the browser once for notification permission. */
export function ArrivalAlertsToggle() {
  const t = useStaffT();
  // Decided after mount so the server and first client render match.
  const [ask, setAsk] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setAsk("Notification" in window && Notification.permission === "default"), 0);
    return () => window.clearTimeout(id);
  }, []);
  if (!ask) return null;
  return (
    <button
      type="button"
      onClick={() => {
        void Notification.requestPermission().then(() => setAsk(false));
        chime();
      }}
      className="lunia-btn lunia-btn-ghost lunia-btn-sm min-h-11"
      data-testid="arrival-alerts-toggle"
    >
      {t("Turn on arrival alerts")}
    </button>
  );
}
