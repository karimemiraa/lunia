// Free-text CRM/clinical notes attached to a client (VisitNote), optionally
// tied to the booking/visit they were written during. authorUserId is a soft
// reference (see the VisitNote model comment in schema.prisma) so resolving
// a display name requires a separate, batched User lookup -- never a Prisma
// `include`.

import { z } from "zod";
import { prisma } from "@/lib/db";
import type { VisitNote } from "@prisma/client";

// Generous cap: clinical notes can be detailed, but this still guards
// against a runaway paste/upload turning into an unbounded text column.
const MAX_BODY_LENGTH = 10_000;

const addVisitNoteSchema = z.object({
  clientProfileId: z.string().min(1),
  bookingId: z.string().min(1).optional(),
  authorUserId: z.string().min(1),
  body: z.string().min(1, "Note body cannot be empty").max(MAX_BODY_LENGTH, "Note is too long"),
});
export type AddVisitNoteInput = z.input<typeof addVisitNoteSchema>;

export async function addVisitNote(input: AddVisitNoteInput): Promise<VisitNote> {
  const data = addVisitNoteSchema.parse(input);
  return prisma.visitNote.create({
    data: {
      clientProfileId: data.clientProfileId,
      bookingId: data.bookingId ?? null,
      authorUserId: data.authorUserId,
      body: data.body,
    },
  });
}

export type VisitNoteWithAuthor = VisitNote & { authorName?: string };

/** Pinned-first, then newest-first notes for a client, with authorName resolved via a single batched User lookup. */
export async function listVisitNotes(clientProfileId: string): Promise<VisitNoteWithAuthor[]> {
  const notes = await prisma.visitNote.findMany({
    where: { clientProfileId },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });
  if (notes.length === 0) return [];

  const authorIds = [...new Set(notes.map((n) => n.authorUserId))];
  const authors = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    include: { staffProfile: true, clientProfile: true },
  });
  const nameById = new Map(authors.map((u) => [u.id, u.staffProfile?.fullName ?? u.clientProfile?.fullName]));

  return notes.map((note) => ({ ...note, authorName: nameById.get(note.authorUserId) ?? undefined }));
}

/** Pins or unpins a note so it surfaces (or stops surfacing) at the top of the profile. */
export async function setNotePinned(id: string, pinned: boolean): Promise<void> {
  await prisma.visitNote.update({ where: { id }, data: { pinned } });
}

/**
 * Deletes a visit note, but only on behalf of its original author --
 * `byUserId` must match the note's authorUserId. The admin PAGE layer is
 * expected to additionally allow staff holding CLIENT_MANAGE to delete any
 * note (by resolving that permission itself and skipping straight to a raw
 * prisma.visitNote.delete rather than calling through this author-only gate).
 */
export async function deleteVisitNote(id: string, byUserId: string): Promise<void> {
  const note = await prisma.visitNote.findUnique({ where: { id } });
  if (!note) {
    throw new Error(`Visit note "${id}" not found`);
  }
  if (note.authorUserId !== byUserId) {
    throw new Error("Only the author can delete this visit note");
  }
  await prisma.visitNote.delete({ where: { id } });
}
