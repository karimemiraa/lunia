"use client";

import { useEffect } from "react";
import { useStaffT } from "../_i18n/StaffI18n";

// Keeps the tab title meaningful ("(3) Calendar · Lunia Staff") so staff see
// the open-item count even when the tab is in the background.
export function DocumentTitle({ title, badge }: { title: string; badge: number }) {
  const brand = useStaffT()("Lunia Staff");
  useEffect(() => {
    document.title = `${badge > 0 ? `(${badge > 99 ? "99+" : badge}) ` : ""}${title} · ${brand}`;
  }, [title, badge, brand]);
  return null;
}
