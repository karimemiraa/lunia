"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateStaff } from "@/modules/iam/auth";
import { createSession } from "@/modules/iam/session";
import { checkLoginAllowed, recordLoginFailure, recordLoginSuccess } from "@/modules/iam/loginThrottle";

// Generic, non-enumerating copy: identical for wrong password and unknown
// email; a distinct message only for the lockout, which still reveals nothing
// about whether the account exists.
const INVALID = "Invalid credentials";
const LOCKED = "Too many attempts. Please try again later.";

async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "unknown").trim();
}

export async function login(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const emailKey = `email:${email.trim().toLowerCase()}`;
  const ipKey = `ip:${await clientIp()}`;

  // Block if either the per-email or per-IP counter is locked out.
  const [emailAllowed, ipAllowed] = await Promise.all([
    checkLoginAllowed(emailKey),
    checkLoginAllowed(ipKey),
  ]);
  if (!emailAllowed.allowed || !ipAllowed.allowed) return { error: LOCKED };

  const user = await authenticateStaff(email, password);
  if (!user) {
    await Promise.all([recordLoginFailure(emailKey), recordLoginFailure(ipKey)]);
    return { error: INVALID };
  }

  await Promise.all([recordLoginSuccess(emailKey), recordLoginSuccess(ipKey)]);
  const token = await createSession(user.id);
  (await cookies()).set("lunia_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect("/admin");
}
