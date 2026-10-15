"use client";

import { useStaffT } from "../_i18n/StaffI18n";
import { translateStatus } from "./labels";

/** A status label in the staff language (for server-safe pills). */
export function StatusText({ label }: { label: string }) {
  return <>{translateStatus(label, useStaffT())}</>;
}
