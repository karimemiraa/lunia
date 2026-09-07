import { describe, it, expect } from "vitest";
import { parseEnv } from "@/lib/env";

describe("parseEnv", () => {
  it("throws when SESSION_SECRET is missing", () => {
    expect(() => parseEnv({ DATABASE_URL: "postgres://x", REDIS_URL: "redis://x", APP_URL: "http://x", NODE_ENV: "test" } as Record<string, string>)).toThrow();
  });
  it("returns typed env when valid", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://x", REDIS_URL: "redis://x", SESSION_SECRET: "s".repeat(32), APP_URL: "http://x", NODE_ENV: "test" });
    expect(env.SESSION_SECRET.length).toBe(32);
  });
});
