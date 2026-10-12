import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** True after hydration (false during SSR) — e.g. to gate createPortal, without a setState-in-effect. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
