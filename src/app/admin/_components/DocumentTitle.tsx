"use client";

import { useEffect } from "react";

// Keeps the tab title meaningful ("(3) Calendar · Lunia Staff") so staff see
// the open-item count even when the tab is in the background.
export function DocumentTitle({ title, badge }: { title: string; badge: number }) {
  useEffect(() => {
    document.title = `${badge > 0 ? `(${badge > 99 ? "99+" : badge}) ` : ""}${title} · Lunia Staff`;
  }, [title, badge]);
  return null;
}
