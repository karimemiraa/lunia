import { z } from "zod";
import type { ContactInquiry } from "@prisma/client";
import { prisma } from "@/lib/db";

export const inquiryInputSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(3),
  email: z.string().optional(),
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
