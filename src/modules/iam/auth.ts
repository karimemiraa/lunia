import { prisma } from "@/lib/db";
import { verifyPassword } from "./password";

export async function authenticateStaff(email: string, password: string): Promise<{ id: string } | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || !user.passwordHash || user.type !== "STAFF") return null;
  const ok = await verifyPassword(password, user.passwordHash);
  return ok ? { id: user.id } : null;
}
