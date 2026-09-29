"use client";

import { useRef } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

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
  return (
    <span ref={anchor} className="contents">
      <ConfirmDialog
        title={title ?? `${label}?`}
        description={confirmMessage}
        verb={label}
        onConfirm={async () => {
          const form = anchor.current?.closest("form");
          await action(form ? new FormData(form) : new FormData());
        }}
      >
        {label}
      </ConfirmDialog>
    </span>
  );
}
