import { describe, it, expect } from "vitest";
import { localeDirection } from "@/i18n/routing";

describe("i18n", () => {
  it("ar is rtl, en is ltr", () => {
    expect(localeDirection("ar")).toBe("rtl");
    expect(localeDirection("en")).toBe("ltr");
  });
});
