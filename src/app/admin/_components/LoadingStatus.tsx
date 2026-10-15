"use client";

import type { ReactNode } from "react";
import { useStaffT } from "../_i18n/StaffI18n";

/** The live "Loading" region around route skeletons, labelled in the staff language. */
export function LoadingStatus({ className, children }: { className?: string; children: ReactNode }) {
  const t = useStaffT();
  return (
    <div className={className} role="status" aria-live="polite" aria-label={t("Loading")}>
      {children}
    </div>
  );
}
