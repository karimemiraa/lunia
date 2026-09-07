"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateStaff } from "@/modules/iam/auth";
import { createSession } from "@/modules/iam/session";

export async function login(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const user = await authenticateStaff(email, password);
  if (!user) return { error: "Invalid credentials" };
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
