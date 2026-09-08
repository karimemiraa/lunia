// Write-side helpers for treatment Rooms, used by the admin Rooms CRUD
// surface (src/app/admin/booking/rooms/*). Rooms are also read directly by
// the availability engine (src/modules/booking/availability.ts) via prisma;
// this module only owns the admin mutation paths.

import { z } from "zod";
import type { Room } from "@prisma/client";
import { prisma } from "@/lib/db";

export interface CreateRoomInput {
  name: string;
  capacity?: number;
  order?: number;
}

export interface UpdateRoomInput {
  name?: string;
  capacity?: number;
  order?: number;
  isActive?: boolean;
}

const createRoomSchema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().min(1).optional(),
  order: z.number().int().optional(),
});

const updateRoomSchema = z.object({
  name: z.string().min(1).optional(),
  capacity: z.number().int().min(1).optional(),
  order: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function listRooms(): Promise<Room[]> {
  return prisma.room.findMany({ orderBy: { order: "asc" } });
}

export async function createRoom(input: CreateRoomInput): Promise<Room> {
  const data = createRoomSchema.parse(input);
  return prisma.room.create({
    data: {
      name: data.name,
      capacity: data.capacity ?? 1,
      order: data.order ?? 0,
    },
  });
}

export async function updateRoom(id: string, input: UpdateRoomInput): Promise<Room> {
  const data = updateRoomSchema.parse(input);

  const existing = await prisma.room.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Room "${id}" not found`);
  }

  return prisma.room.update({
    where: { id },
    data: {
      name: data.name,
      capacity: data.capacity,
      order: data.order,
      isActive: data.isActive,
    },
  });
}

// Hard-deletes a room, unless it already has appointments on file (past or
// future) — those rows need `room` to stay resolvable for history/receipts,
// so we refuse the delete with a clear error and point the admin at
// deactivating the room instead (updateRoom(id, { isActive: false })), which
// simply removes it from availability without touching existing bookings.
export async function deleteRoom(id: string): Promise<void> {
  const existing = await prisma.room.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Room "${id}" not found`);
  }

  const appointmentCount = await prisma.appointment.count({ where: { roomId: id } });
  if (appointmentCount > 0) {
    throw new Error(
      `Cannot delete room "${existing.name}": it has ${appointmentCount} appointment(s) on file. Deactivate it instead.`,
    );
  }

  await prisma.room.delete({ where: { id } });
}
