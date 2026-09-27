"use server";

// Public server actions behind the website assistant widget. Intentionally
// unauthenticated (anyone browsing the site can chat); every input is
// validated and rate-limited in src/modules/assistant/service.ts, and all
// conversation logic runs there. These only bridge cookies and headers.

import { z } from "zod";
import { cookies, headers } from "next/headers";
import { CLIENT_SESSION_COOKIE } from "@/modules/iam/clientAuth";
import { asLocale } from "@/modules/assistant/copy";
import { CHAT_COOKIE, CHAT_COOKIE_MAX_AGE, openChat, resetChat, sendChat, type ChatContext, type ChatResult } from "@/modules/assistant/service";
import type { ChatView } from "@/modules/assistant/types";

async function clientIp(): Promise<string> {
  const h = await headers();
  // Same trust rules as admin login: X-Real-IP from nginx, else the last
  // (proxy-appended) X-Forwarded-For entry.
  const realIp = h.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const parts = (h.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "unknown";
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

async function context(locale: string): Promise<ChatContext> {
  const jar = await cookies();
  return {
    token: jar.get(CHAT_COOKIE)?.value ?? null,
    locale: asLocale(locale),
    ip: await clientIp(),
    async onClientSignedIn(sessionToken) {
      // Same client session the booking wizard establishes after an OTP.
      (await cookies()).set(CLIENT_SESSION_COOKIE, sessionToken, { ...cookieOptions, maxAge: CHAT_COOKIE_MAX_AGE });
    },
  };
}

async function finish(result: ChatResult): Promise<ChatView> {
  if (result.newToken) (await cookies()).set(CHAT_COOKIE, result.newToken, { ...cookieOptions, maxAge: CHAT_COOKIE_MAX_AGE });
  return result.view;
}

const localeSchema = z.string().max(5);
const inputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().max(4000) }),
  z.object({ kind: z.literal("choice"), value: z.string().max(100) }),
]);

export async function assistantOpen(locale: string): Promise<ChatView> {
  return (await openChat(await context(localeSchema.catch("ar").parse(locale)))).view;
}

export async function assistantSend(locale: string, input: { kind: "text"; text: string } | { kind: "choice"; value: string }): Promise<ChatView> {
  const ctx = await context(localeSchema.catch("ar").parse(locale));
  const parsed = inputSchema.safeParse(input);
  // An oversized/garbled payload is answered like any unreadable message.
  return finish(await sendChat(ctx, parsed.success ? parsed.data : { kind: "text", text: "" }));
}

export async function assistantReset(locale: string): Promise<ChatView> {
  const ctx = await context(localeSchema.catch("ar").parse(locale));
  (await cookies()).delete(CHAT_COOKIE);
  return (await resetChat(ctx)).view;
}
