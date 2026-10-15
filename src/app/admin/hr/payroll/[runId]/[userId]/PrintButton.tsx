"use client";

import { useStaffT } from "../../../../_i18n/StaffI18n";

export function PrintButton() {
  const t = useStaffT();
  return (
    <button type="button" onClick={() => window.print()} className="lunia-btn lunia-btn-forest min-h-11">
      {t("Print / save as PDF")}
    </button>
  );
}
