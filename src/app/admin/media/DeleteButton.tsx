"use client";

interface DeleteButtonProps {
  action: (formData: FormData) => void | Promise<void>;
}

export function DeleteButton({ action }: DeleteButtonProps) {
  return (
    <button
      type="submit"
      formAction={action}
      onClick={(event) => {
        if (!confirm("Delete this media item? This cannot be undone.")) {
          event.preventDefault();
        }
      }}
      className="rounded border border-red-600/30 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
    >
      Delete
    </button>
  );
}
