"use client";

interface ConfirmDeleteButtonProps {
  action: (formData: FormData) => void | Promise<void>;
  confirmMessage: string;
  label?: string;
}

/**
 * A submit button that overrides its enclosing form's action (via
 * `formAction`) and asks for confirmation first. Generalizes the
 * admin/media/DeleteButton.tsx pattern for reuse across the catalog admin
 * list tables (departments, services, brands, journal).
 */
export function ConfirmDeleteButton({ action, confirmMessage, label = "Delete" }: ConfirmDeleteButtonProps) {
  return (
    <button
      type="submit"
      formAction={action}
      onClick={(event) => {
        if (!confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      className="rounded border border-red-600/30 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
    >
      {label}
    </button>
  );
}
