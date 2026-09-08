import { prisma } from "@/lib/db";
import { verifyPassword } from "./password";

// A fixed bcrypt hash (cost 12, matching hashPassword) of a random string.
// When the user is absent/inactive/non-staff we still run verifyPassword
// against this so the response time does not reveal whether the account
// exists (user-enumeration timing). The value is public and corresponds to no
// real password.
const DUMMY_HASH = "$2b$12$mq5XQoDKh5rx3rB9EzoBnejbJbmMr5iAYhlNrsCTAzaoVCT1jpp/y";

export async function authenticateStaff(email: string, password: string): Promise<{ id: string } | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  const eligible = Boolean(user && user.isActive && user.passwordHash && user.type === "STAFF");
  // Always run a verify (real hash when eligible, dummy otherwise) so the
  // absent-user path costs the same as the wrong-password path.
  const hash = eligible ? user!.passwordHash! : DUMMY_HASH;
  const ok = await verifyPassword(password, hash);
  return ok && eligible ? { id: user!.id } : null;
}
