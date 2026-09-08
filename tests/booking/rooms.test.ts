import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { listRooms, createRoom, updateRoom, deleteRoom } from "@/modules/booking/rooms";

// Every room/user created by this suite carries a unique-per-run prefix so
// cleanup can find (and remove) everything it created, regardless of which
// test created it or whether an assertion failed partway through.
const NAME_PREFIX = `E2E Room Test ${Date.now()}`;
let nameCounter = 0;
function freshName(): string {
  nameCounter += 1;
  return `${NAME_PREFIX} ${nameCounter}`;
}

const PHONE_PREFIX = `+9665ROOMTEST${Date.now()}`;
let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  return `${PHONE_PREFIX}${phoneCounter}`;
}

afterEach(async () => {
  await prisma.user.deleteMany({ where: { phone: { startsWith: PHONE_PREFIX } } });
  await prisma.room.deleteMany({ where: { name: { startsWith: NAME_PREFIX } } });
});

// Creates a real Appointment referencing `roomId`, via a fresh CLIENT
// user + Booking, so deleteRoom's "has appointments" guard has something
// real to find. Returns the created user's id for cleanup.
async function createAppointmentInRoom(roomId: string): Promise<string> {
  const service = await prisma.service.findUniqueOrThrow({ where: { slug: "diagnostic-skin-analysis" } });
  const owner = await prisma.user.findUniqueOrThrow({ where: { email: "owner@lunia.local" } });
  const client = await prisma.user.create({
    data: {
      type: "CLIENT",
      phone: freshPhone(),
      clientProfile: { create: { fullName: "Room Delete Test Client" } },
    },
    include: { clientProfile: true },
  });
  const booking = await prisma.booking.create({
    data: { clientProfileId: client.clientProfile!.id, status: "CONFIRMED", channel: "ONLINE" },
  });
  await prisma.appointment.create({
    data: {
      bookingId: booking.id,
      serviceId: service.id,
      staffUserId: owner.id,
      roomId,
      startAt: new Date("2026-01-05T10:00:00Z"),
      endAt: new Date("2026-01-05T11:00:00Z"),
    },
  });
  return client.id;
}

describe("createRoom", () => {
  it("creates a room with defaults when capacity/order are omitted", async () => {
    const name = freshName();
    const room = await createRoom({ name });
    expect(room.name).toBe(name);
    expect(room.capacity).toBe(1);
    expect(room.order).toBe(0);
    expect(room.isActive).toBe(true);
  });

  it("rejects capacity < 1", async () => {
    await expect(createRoom({ name: freshName(), capacity: 0 })).rejects.toThrow();
  });
});

describe("listRooms", () => {
  it("includes a newly created room, ordered by `order`", async () => {
    const name = freshName();
    await createRoom({ name, order: -1000 });
    const rooms = await listRooms();
    expect(rooms[0]?.name).toBe(name);
  });
});

describe("updateRoom", () => {
  it("updates fields and throws for an unknown id", async () => {
    const room = await createRoom({ name: freshName() });
    const updated = await updateRoom(room.id, { capacity: 3, isActive: false });
    expect(updated.capacity).toBe(3);
    expect(updated.isActive).toBe(false);

    await expect(updateRoom("does-not-exist", { capacity: 2 })).rejects.toThrow(/not found/);
  });
});

describe("deleteRoom", () => {
  it("deletes a room with no appointments", async () => {
    const room = await createRoom({ name: freshName() });
    await deleteRoom(room.id);
    const found = await prisma.room.findUnique({ where: { id: room.id } });
    expect(found).toBeNull();
  });

  it("blocks deleting a room that has appointments on file, with a clear error", async () => {
    const room = await createRoom({ name: freshName() });
    const clientUserId = await createAppointmentInRoom(room.id);
    try {
      await expect(deleteRoom(room.id)).rejects.toThrow(/appointment/i);
    } finally {
      // Deleting the client user cascades ClientProfile -> Booking ->
      // Appointment, freeing the room so the afterEach cleanup can delete it.
      await prisma.user.delete({ where: { id: clientUserId } });
    }
  });

  it("throws for an unknown id", async () => {
    await expect(deleteRoom("does-not-exist")).rejects.toThrow(/not found/);
  });
});
