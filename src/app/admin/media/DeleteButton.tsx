"use client";

import { ConfirmButton } from "../_ui/ConfirmDialog";

interface DeleteButtonProps {
  action: (formData: FormData) => void | Promise<void>;
  /** File name shown in the confirm copy. */
  name?: string;
}

export function DeleteButton({ action, name }: DeleteButtonProps) {
  return (
    <ConfirmButton title="Delete this media item?" description={`${name ? `“${name}” ` : "It "}will be removed from the library and from any page that uses it. This cannot be undone.`} confirmLabel="Delete" formAction={action}>
      Delete
    </ConfirmButton>
  );
}
