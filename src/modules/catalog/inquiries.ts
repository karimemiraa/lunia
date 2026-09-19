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

export async function getInquiry(id: string): Promise<ContactInquiry | null> {
  return prisma.contactInquiry.findUnique({ where: { id } });
}

/** Assigns (or clears) the staff member handling an inquiry. */
export async function assignInquiry(id: string, assignedToId: string | null): Promise<void> {
  await prisma.contactInquiry.update({ where: { id }, data: { assignedToId } });
}

/**
 * Links an inquiry to a customer record: finds/creates a ClientProfile from the
 * inquiry's contact (as an INBOUND lead) and stores the link on the inquiry.
 */
export async function linkInquiryToCustomer(id: string, byUserId: string): Promise<string> {
  const inquiry = await prisma.contactInquiry.findUnique({ where: { id } });
  if (!inquiry) throw new Error("Inquiry not found");
  if (inquiry.clientProfileId) return inquiry.clientProfileId;
  const { createLead } = await import("@/modules/crm/leads");
  const { clientProfileId } = await createLead({
    fullName: inquiry.name,
    phone: inquiry.phone,
    email: inquiry.email,
    direction: "INBOUND",
    source: inquiry.sourcePage ? `inquiry (${inquiry.sourcePage})` : "inquiry",
    byUserId,
  });
  await prisma.contactInquiry.update({ where: { id }, data: { clientProfileId } });
  return clientProfileId;
}

/**
 * Sends an emailed reply to the inquiry and records it (repliedAt + replyBody),
 * marking the inquiry handled. Requires the inquiry to have an email.
 */
export async function replyToInquiry(id: string, body: string, _byUserId: string): Promise<void> {
  const inquiry = await prisma.contactInquiry.findUnique({ where: { id } });
  if (!inquiry) throw new Error("Inquiry not found");
  const text = body.trim();
  if (!text) throw new Error("Reply is empty");
  if (!inquiry.email) throw new Error("This inquiry has no email address to reply to");

  const { resolveSenderForChannel } = await import("@/modules/comms/sender");
  const subject = inquiry.locale === "ar" ? "رد من لونيا" : "A reply from Lunia";
  const emailSender = await resolveSenderForChannel("email");
  const result = await emailSender.send({
    channel: "email",
    toEmail: inquiry.email,
    subject,
    body: text,
    kind: "INQUIRY_REPLY",
    recipientName: inquiry.name,
    locale: inquiry.locale,
  });
  if (!result.ok) throw new Error("The email could not be sent");

  await prisma.contactInquiry.update({ where: { id }, data: { repliedAt: new Date(), replyBody: text, handled: true } });
}
