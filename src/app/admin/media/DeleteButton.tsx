"use client";

import { ConfirmButton } from "../_ui/ConfirmDialog";
import { useStaffT } from "../_i18n/StaffI18n";

interface DeleteButtonProps {
  action: (formData: FormData) => void | Promise<void>;
  /** File name shown in the confirm copy. */
  name?: string;
}

export function DeleteButton({ action, name }: DeleteButtonProps) {
  const t = useStaffT();
  const description = name
    ? t("“{name}” will be removed from the library and from any page that uses it. This cannot be undone.", { name })
    : t("It will be removed from the library and from any page that uses it. This cannot be undone.");
  return (
    <ConfirmButton title={t("Delete this media item?")} description={description} confirmLabel={t("Delete")} formAction={action}>
      {t("Delete")}
    </ConfirmButton>
  );
}
