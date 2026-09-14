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
      className="lunia-btn lunia-btn-danger lunia-btn-sm"
    >
      Delete
    </button>
  );
}
