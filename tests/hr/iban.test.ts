import { describe, it, expect } from "vitest";
import { isValidSaudiIban, normalizeIban, formatIban } from "@/modules/hr/iban";

describe("Saudi IBAN validation", () => {
  it("accepts a valid SA IBAN, with or without spaces and in any case", () => {
    expect(isValidSaudiIban("SA0380000000608010167519")).toBe(true);
    expect(isValidSaudiIban("sa03 8000 0000 6080 1016 7519")).toBe(true);
    expect(isValidSaudiIban("SA4420000001234567891234")).toBe(true);
  });

  it("rejects a wrong check digit (mod-97)", () => {
    expect(isValidSaudiIban("SA0480000000608010167519")).toBe(false);
  });

  it("rejects wrong length, country or letters in the account part", () => {
    expect(isValidSaudiIban("SA038000000060801016751")).toBe(false);
    expect(isValidSaudiIban("AE070331234567890123456")).toBe(false);
    expect(isValidSaudiIban("SA03800000006080101675AB")).toBe(false);
    expect(isValidSaudiIban("")).toBe(false);
  });

  it("normalizes and formats for display", () => {
    expect(normalizeIban(" sa03-8000 0000 6080 1016 7519 ")).toBe("SA0380000000608010167519");
    expect(formatIban("SA0380000000608010167519")).toBe("SA03 8000 0000 6080 1016 7519");
  });
});
