import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

/** The customer a patient-file sub-page is about, or a 404. */
export async function loadClient(clientProfileId: string) {
  const client = await prisma.clientProfile.findUnique({
    where: { id: clientProfileId },
    select: { id: true, fullName: true, user: { select: { phone: true, email: true } } },
  });
  if (!client) notFound();
  return { ...client, displayName: client.fullName || client.user.phone || client.user.email || "Customer" };
}
