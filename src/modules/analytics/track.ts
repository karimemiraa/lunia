// First-party, privacy-preserving analytics ingest. Stores NO PII: no raw
// IPs, no full referrer URLs (host only), no query strings. Everything here
// is deliberately a thin normalize-then-write layer so the /api/track beacon
// (unauthenticated, public) never persists anything it wasn't told to keep.
//
// See docs/superpowers/plans/2026-09-08-lunia-crm.md ("Privacy" constraint).

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";

const MAX_PATH_LEN = 512;
const MAX_HOST_LEN = 255;
const MAX_SOURCE_LEN = 100;
const MAX_SESSION_LEN = 64;
const MAX_LOCALE_LEN = 20;
const MAX_EVENT_NAME_LEN = 64;
const MAX_META_JSON_BYTES = 2000;

// A "source" is only ever a short attribution token (e.g. a utm_source
// value or a referral tag like "instagram") -- never free text -- so a
// simple alphanumeric token is all we accept.
const SOURCE_TOKEN_RE = /^[a-zA-Z0-9_-]+$/;

/** Strip a path down to its pathname only: no query string, no hash, no PII. */
export function normalizePath(path: string): string {
  let pathname: string;
  try {
    pathname = new URL(path, "http://internal.invalid").pathname;
  } catch {
    pathname = path.split("?")[0]!.split("#")[0]!;
  }
  if (!pathname) pathname = "/";
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  return pathname.slice(0, MAX_PATH_LEN);
}

function ownHostname(): string | undefined {
  try {
    return new URL(getEnv().APP_URL).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Reduce a referrer URL down to its hostname only -- never store the full
 * referrer (it can carry query strings / PII). Returns undefined for an
 * empty, unparsable, or same-origin referrer.
 */
export function normalizeReferrerHost(referrer?: string | null): string | undefined {
  if (!referrer) return undefined;
  let hostname: string;
  try {
    hostname = new URL(referrer).hostname;
  } catch {
    return undefined;
  }
  if (!hostname) return undefined;
  if (hostname === ownHostname()) return undefined;
  return hostname.slice(0, MAX_HOST_LEN);
}

/** Keep a source only if it's a short, simple attribution token. */
export function normalizeSource(source?: string | null): string | undefined {
  if (!source) return undefined;
  const trimmed = source.trim().slice(0, MAX_SOURCE_LEN);
  if (!trimmed || !SOURCE_TOKEN_RE.test(trimmed)) return undefined;
  return trimmed;
}

function normalizeSessionId(sessionId: string): string {
  return sessionId.trim().slice(0, MAX_SESSION_LEN);
}

function normalizeLocale(locale?: string | null): string | undefined {
  if (!locale) return undefined;
  const trimmed = locale.trim().slice(0, MAX_LOCALE_LEN);
  return trimmed || undefined;
}

/** Drop a meta payload entirely if it's not a small plain object. */
function normalizeMeta(meta?: Record<string, unknown> | null): Prisma.InputJsonValue | undefined {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  let json: string;
  try {
    json = JSON.stringify(meta);
  } catch {
    return undefined;
  }
  if (!json || json.length > MAX_META_JSON_BYTES) return undefined;
  return meta as Prisma.InputJsonValue;
}

export interface RecordPageViewInput {
  path: string;
  locale?: string;
  referrer?: string;
  source?: string;
  sessionId: string;
}

export async function recordPageView(input: RecordPageViewInput): Promise<void> {
  await prisma.pageView.create({
    data: {
      path: normalizePath(input.path),
      locale: normalizeLocale(input.locale),
      referrerHost: normalizeReferrerHost(input.referrer),
      source: normalizeSource(input.source),
      sessionId: normalizeSessionId(input.sessionId),
    },
  });
}

export interface RecordEventInput {
  name: string;
  path?: string;
  sessionId: string;
  meta?: Record<string, unknown>;
}

export async function recordEvent(input: RecordEventInput): Promise<void> {
  await prisma.analyticsEvent.create({
    data: {
      name: input.name.trim().slice(0, MAX_EVENT_NAME_LEN),
      path: input.path ? normalizePath(input.path) : undefined,
      sessionId: normalizeSessionId(input.sessionId),
      meta: normalizeMeta(input.meta),
    },
  });
}
