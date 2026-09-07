import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("health route", () => {
  it("returns ok", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
