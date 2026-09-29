// Client-side "seen" state for the derived notification feed. The server feed
// has no per-user rows (it's computed from what still needs attention), so
// "mark as seen" lives in localStorage and just quiets the item visually.

export const SEEN_KEY = "lunia-notifications-seen";
const SEEN_MAX = 300;

export function readSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function writeSeen(ids: Iterable<string>): void {
  try {
    const list = [...ids].slice(-SEEN_MAX);
    localStorage.setItem(SEEN_KEY, JSON.stringify(list));
  } catch {}
}

/** Prunes ids no longer in the feed so the list never grows unbounded. */
export function pruneSeen(seen: Set<string>, liveIds: string[]): Set<string> {
  const live = new Set(liveIds);
  return new Set([...seen].filter((id) => live.has(id)));
}
