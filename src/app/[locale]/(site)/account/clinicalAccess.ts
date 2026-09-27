import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getClientSessionUser, CLIENT_SESSION_COOKIE } from "@/modules/iam/clientAuth";

export type AccountLocale = "ar" | "en";
export const asAccountLocale = (locale: string): AccountLocale => (locale === "en" ? "en" : "ar");

// The signed-in client's profile for the account sub-pages (health profile,
// consents), or a redirect to the login page.
export async function requireAccountProfile(locale: AccountLocale) {
  const token = (await cookies()).get(CLIENT_SESSION_COOKIE)?.value;
  const user = token ? await getClientSessionUser(token) : null;
  if (!user) redirect(`/${locale}/account/login`);
  const profile = await prisma.clientProfile.findUnique({ where: { userId: user.id } });
  if (!profile) redirect(`/${locale}/account/login`);
  return profile;
}
