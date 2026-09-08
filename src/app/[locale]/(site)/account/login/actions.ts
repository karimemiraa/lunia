"use server";

// Server actions backing the client account login form (LoginForm.tsx):
// phone -> OTP -> session cookie. Mirrors the OTP pattern used by the
// booking wizard's contact step (see ../../book/actions.ts) but issues no
// booking of its own — this is a bare sign-in for /account.

import { z } from "zod";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { requestOtp, verifyOtp, createClientSession, CLIENT_SESSION_COOKIE } from "@/modules/iam/clientAuth";

type AccountLocale = "en" | "ar";

function asAccountLocale(locale: string): AccountLocale {
  return locale === "ar" ? "ar" : "en";
}

async function errorTranslator(locale: string) {
  return getTranslations({ locale: asAccountLocale(locale), namespace: "account.login.errors" });
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const phoneSchema = z.string().trim().min(6).max(20);

export type StartLoginOtpResult = { ok: true; devCode?: string } | { ok: false; error: string };

export async function startLoginOtp(phone: string, locale: string): Promise<StartLoginOtpResult> {
  const t = await errorTranslator(locale);
  try {
    const normalized = phoneSchema.parse(phone);
    const result = await requestOtp(normalized);
    return { ok: true, devCode: result.devCode };
  } catch (err) {
    const message = messageOf(err);
    if (message.includes("Invalid phone")) return { ok: false, error: t("invalidPhone") };
    if (message.includes("Too many OTP")) return { ok: false, error: t("rateLimited") };
    return { ok: false, error: t("generic") };
  }
}

const verifyLoginSchema = z.object({
  phone: z.string().trim().min(6).max(20),
  code: z.string().trim().regex(/^\d{6}$/, "Invalid code"),
  locale: z.enum(["en", "ar"]),
});
export type VerifyLoginInput = z.input<typeof verifyLoginSchema>;

export type VerifyLoginResult = { ok: true } | { ok: false; error: string };

// Verifies the OTP and, on success, establishes the client session cookie.
// The caller (LoginForm) navigates to /account itself once this resolves ok
// — this action never redirects, since it's invoked from client-side JS via
// useTransition rather than as a raw <form action>.
export async function verifyLogin(input: VerifyLoginInput): Promise<VerifyLoginResult> {
  const data = verifyLoginSchema.parse(input);
  const t = await errorTranslator(data.locale);

  const verified = await verifyOtp(data.phone, data.code);
  if (!verified) {
    return { ok: false, error: t("invalidCode") };
  }

  const token = await createClientSession(verified.userId);
  (await cookies()).set(CLIENT_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return { ok: true };
}
