"use client";

import { useRef } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { useStaffLocale, useStaffT } from "../_i18n/StaffI18n";
import { hasArabic } from "../_i18n/t";

interface ConfirmDeleteButtonProps {
  action: (formData: FormData) => void | Promise<void>;
  confirmMessage: string;
  label?: string;
  /** Dialog heading; defaults to "<label>?". */
  title?: string;
}

/**
 * A destructive button that lives inside a form and submits that form's
 * fields to `action` after the user confirms in a proper dialog (no
 * window.confirm). Drop-in for the previous formAction-based version.
 */
export function ConfirmDeleteButton({ action, confirmMessage, label = "Delete", title }: ConfirmDeleteButtonProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const t = useStaffT();
  const arabic = useStaffLocale() === "ar";
  // "<label>?" — in Arabic, fall back to the translated label with «؟» when the question has no entry.
  const heading = title ?? (arabic && !hasArabic(`${label}?`) ? `${t(label)}؟` : `${label}?`);
  return (
    <span ref={anchor} className="contents">
      <ConfirmDialog
        title={heading}
        description={confirmMessage}
        verb={label}
        onConfirm={async () => {
          const form = anchor.current?.closest("form");
          await action(form ? new FormData(form) : new FormData());
        }}
      >
        {t(label)}
      </ConfirmDialog>
    </span>
  );
}
