import { z } from "zod";
import type { ContactInquiry } from "@prisma/client";
import { prisma } from "@/lib/db";

export const inquiryInputSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(3),
  // The contact-form action already converts an empty string to
  // `undefined` before calling createInquiry, so a defined value here is
  // always a real submitted address and should be format-checked.
  email: z.string().email().optional(),
  message: z.string().min(1),
  locale: z.enum(["ar", "en"]),
  sourcePage: z.string().optional(),
});
export type InquiryInput = z.infer<typeof inquiryInputSchema>;

// Validates `input` (throwing on invalid data) and creates a ContactInquiry
// row from it.
export async function createInquiry(input: InquiryInput): Promise<ContactInquiry> {
  const data = inquiryInputSchema.parse(input);
  return prisma.contactInquiry.create({ data });
}

// Lists all inquiries, newest first — for the admin inbox.
export async function listInquiries(): Promise<ContactInquiry[]> {
  return prisma.contactInquiry.findMany({ orderBy: { createdAt: "desc" } });
}

// Toggles the `handled` flag on an inquiry. Throws if the inquiry doesn't
// exist.
export async function setInquiryHandled(id: string, handled: boolean): Promise<ContactInquiry> {
  const existing = await prisma.contactInquiry.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Inquiry "${id}" not found`);
  }
  return prisma.contactInquiry.update({ where: { id }, data: { handled } });
}
