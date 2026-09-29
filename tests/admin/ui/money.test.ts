import { describe, it, expect } from "vitest";
import { formatSar, formatSarLead, minorToInput, parseSarToMinor, formatPercentBp } from "@/app/admin/_ui/money";
import { formatDate, formatDateTime, formatRelative, toISODate } from "@/app/admin/_ui/dates";
import { statusTone, statusLabel } from "@/app/admin/_ui/StatusPill";

describe("_ui money", () => {
  it("formats halalas with two decimals, thousands separators and the SAR unit", () => {
    expect(formatSar(124950)).toBe("1,249.50 SAR");
    expect(formatSar(0)).toBe("0.00 SAR");
    expect(formatSar(-2500)).toBe("-25.00 SAR");
    expect(formatSarLead(100)).toBe("SAR 1.00");
  });
  it("round-trips input values", () => {
    expect(minorToInput(124950)).toBe("1249.50");
    expect(minorToInput(25000)).toBe("250");
    expect(minorToInput(0)).toBe("");
    expect(parseSarToMinor("1,249.50")).toBe(124950);
    expect(parseSarToMinor("abc")).toBeNull();
  });
  it("formats VAT basis points", () => {
    expect(formatPercentBp(1500)).toBe("15%");
    expect(formatPercentBp(1250)).toBe("12.50%");
  });
});

describe("_ui dates (Riyadh)", () => {
  const t = new Date("2026-03-12T11:30:00Z"); // 14:30 in Riyadh
  it("uses one short format in center time", () => {
    expect(formatDate(t)).toBe("12 Mar 2026");
    expect(formatDateTime(t)).toBe("12 Mar 2026, 14:30");
    expect(formatDate(null)).toBe("—");
    expect(toISODate(new Date("2026-03-12T22:30:00Z"))).toBe("2026-03-13");
  });
  it("gives relative labels", () => {
    const now = new Date("2026-03-12T12:00:00Z");
    expect(formatRelative(new Date("2026-03-12T11:59:40Z"), now)).toBe("just now");
    expect(formatRelative(new Date("2026-03-12T11:30:00Z"), now)).toBe("30 min ago");
    expect(formatRelative(new Date("2026-03-12T09:00:00Z"), now)).toBe("3 h ago");
    expect(formatRelative(new Date("2026-03-11T12:00:00Z"), now)).toBe("yesterday");
    expect(formatRelative(new Date("2026-03-14T12:00:00Z"), now)).toBe("in 2 days");
    expect(formatRelative(new Date("2026-02-01T12:00:00Z"), now)).toBe("1 Feb");
  });
});

describe("_ui status", () => {
  it("maps module statuses to semantic tones and readable labels", () => {
    expect(statusTone("PAID")).toBe("success");
    expect(statusTone("VOID")).toBe("danger");
    expect(statusTone("ISSUED")).toBe("warning");
    expect(statusTone("whatever")).toBe("neutral");
    expect(statusLabel("PARTIALLY_PAID")).toBe("Part paid");
    expect(statusLabel("NO_ANSWER")).toBe("No answer");
  });
});
