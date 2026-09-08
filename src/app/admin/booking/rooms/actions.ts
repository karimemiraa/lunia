"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "../../_components/requireAdmin";
import { PERMISSIONS } from "@/modules/iam/permissions";
import { createRoom, updateRoom, deleteRoom } from "@/modules/booking/rooms";

export interface RoomActionState {
  error?: string;
  success?: boolean;
}

function numberOrUndefined(formData: FormData, name: string): number | undefined {
  const raw = formData.get(name);
  if (raw === null || String(raw).trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export async function createRoomAction(_prev: RoomActionState | null, formData: FormData): Promise<RoomActionState> {
  await requireAdmin(PERMISSIONS.STAFF_MANAGE);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return { error: "Name is required." };
  }

  try {
    await createRoom({
      name,
      capacity: numberOrUndefined(formData, "capacity"),
      order: numberOrUndefined(formData, "order"),
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create room." };
  }

  revalidatePath("/admin/booking/rooms");
  return { success: true };
}

export async function updateRoomAction(_prev: RoomActionState | null, formData: FormData): Promise<RoomActionState> {
  await requireAdmin(PERMISSIONS.STAFF_MANAGE);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Missing room." };
  }

  const name = String(formData.get("name") ?? "").trim();

  try {
    await updateRoom(id, {
      name: name || undefined,
      capacity: numberOrUndefined(formData, "capacity"),
      order: numberOrUndefined(formData, "order"),
      isActive: formData.get("isActive") === "on",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update room." };
  }

  revalidatePath("/admin/booking/rooms");
  return { success: true };
}

// Uses useActionState (rather than the plain ConfirmDeleteButton pattern
// used by the catalog admin tables) so a blocked delete — e.g. a room with
// appointments on file — surfaces its error message in the row instead of
// throwing an unhandled rejection.
export async function deleteRoomAction(_prev: RoomActionState | null, formData: FormData): Promise<RoomActionState> {
  await requireAdmin(PERMISSIONS.STAFF_MANAGE);

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return { error: "Missing room." };
  }

  try {
    await deleteRoom(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete room." };
  }

  revalidatePath("/admin/booking/rooms");
  return { success: true };
}
