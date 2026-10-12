// Staff edit/change requests ("please change X on page Y"), usually filed from
// the Ask Lunia team assistant and reviewed by owners/admins in /admin/requests.

import { z } from "zod";
import { prisma } from "@/lib/db";

export const EDIT_REQUEST_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export const EDIT_REQUEST_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "DECLINED"] as const;
export type EditRequestPriority = (typeof EDIT_REQUEST_PRIORITIES)[number];
export type EditRequestStatus = (typeof EDIT_REQUEST_STATUSES)[number];

export const editRequestSchema = z.object({
  title: z.string().trim().min(3, "Give the request a short title.").max(140),
  details: z.string().trim().min(5, "Describe what should change.").max(4000),
  priority: z.enum(EDIT_REQUEST_PRIORITIES).default("NORMAL"),
  pagePath: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/[^\s]*$/, "Invalid page.")
    .optional()
    .nullable(),
});
export type EditRequestInput = z.input<typeof editRequestSchema>;

export async function createEditRequest(input: EditRequestInput, by: { id: string; name: string }) {
  const data = editRequestSchema.parse(input);
  return prisma.editRequest.create({
    data: {
      createdById: by.id,
      createdByName: by.name,
      title: data.title,
      details: data.details,
      priority: data.priority,
      pagePath: data.pagePath ?? null,
    },
  });
}

export async function listEditRequests(filter: { status?: EditRequestStatus } = {}) {
  return prisma.editRequest.findMany({
    where: filter.status ? { status: filter.status } : {},
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
}

/** The requester's own requests, newest first (shown back in the assistant). */
export async function listMyEditRequests(userId: string, take = 5) {
  return prisma.editRequest.findMany({ where: { createdById: userId }, orderBy: { createdAt: "desc" }, take });
}

export async function countOpenEditRequests(): Promise<number> {
  return prisma.editRequest.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } });
}

const statusUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(EDIT_REQUEST_STATUSES),
  resolutionNote: z.string().trim().max(2000).optional().nullable(),
});

export async function updateEditRequestStatus(input: z.input<typeof statusUpdateSchema>, byUserId: string) {
  const data = statusUpdateSchema.parse(input);
  const closed = data.status === "DONE" || data.status === "DECLINED";
  return prisma.editRequest.update({
    where: { id: data.id },
    data: {
      status: data.status,
      resolutionNote: data.resolutionNote ?? null,
      resolvedById: closed ? byUserId : null,
      resolvedAt: closed ? new Date() : null,
    },
  });
}
