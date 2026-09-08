import { describe, it, expect } from "vitest";
import { toCsv } from "@/modules/reports/csv";

describe("toCsv", () => {
  it("builds a header row from column labels and one row per data row", () => {
    const csv = toCsv(
      [
        { key: "name", label: "Name" },
        { key: "count", label: "Count" },
      ],
      [
        { name: "Alice", count: 3 },
        { name: "Bob", count: 7 },
      ],
    );

    expect(csv).toBe(["Name,Count", "Alice,3", "Bob,7"].join("\r\n"));
  });

  it("returns just the header row for an empty row set", () => {
    const csv = toCsv([{ key: "a", label: "A" }], []);
    expect(csv).toBe("A");
  });

  it("wraps a field containing a comma in double quotes", () => {
    const csv = toCsv([{ key: "name", label: "Name" }], [{ name: "Doe, Jane" }]);
    expect(csv).toBe('Name\r\n"Doe, Jane"');
  });

  it("wraps a field containing a double quote and doubles the embedded quote", () => {
    const csv = toCsv([{ key: "note", label: "Note" }], [{ note: 'She said "hi"' }]);
    expect(csv).toBe('Note\r\n"She said ""hi"""');
  });

  it("wraps a field containing a newline", () => {
    const csv = toCsv([{ key: "note", label: "Note" }], [{ note: "line one\nline two" }]);
    expect(csv).toBe('Note\r\n"line one\nline two"');
  });

  it("wraps a field containing a carriage return", () => {
    const csv = toCsv([{ key: "note", label: "Note" }], [{ note: "line one\rline two" }]);
    expect(csv).toBe('Note\r\n"line one\rline two"');
  });

  it("does not quote a plain field", () => {
    const csv = toCsv([{ key: "status", label: "Status" }], [{ status: "COMPLETED" }]);
    expect(csv).toBe("Status\r\nCOMPLETED");
  });

  it("renders null/undefined cells as empty fields, not the literal string", () => {
    const csv = toCsv(
      [
        { key: "a", label: "A" },
        { key: "b", label: "B" },
      ],
      [{ a: null, b: undefined }],
    );
    expect(csv).toBe("A,B\r\n,");
  });

  it("quotes a label itself if it needs escaping", () => {
    const csv = toCsv([{ key: "x", label: 'Weird, "Label"' }], [{ x: "value" }]);
    expect(csv).toBe('"Weird, ""Label"""\r\nvalue');
  });
});
