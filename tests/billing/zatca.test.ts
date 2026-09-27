import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { decodeTlv, encodeTlv, zatcaQrBase64, zatcaTimestamp } from "@/modules/billing/zatca/tlv";
import { encodeQr, qrToSvg } from "@/modules/billing/zatca/qrcode";
import { INITIAL_PIH, buildUblXml, invoiceHash } from "@/modules/billing/zatca/ubl";
import { DEFAULT_TAX_SETTINGS } from "@/modules/billing/settings";
import { getZatcaSubmitter } from "@/modules/billing/zatca/submit";

describe("zatca/tlv (Phase 1 QR payload)", () => {
  it("matches a hand-computed byte vector", () => {
    const b64 = zatcaQrBase64({
      sellerName: "Lunia",
      vatNumber: "300000000000003",
      timestamp: "2026-09-27T09:30:00Z",
      totalWithVat: "115.00",
      vatTotal: "15.00",
    });
    const hex = Buffer.from(b64, "base64").toString("hex");
    expect(hex).toBe(
      [
        "01054c756e6961", // tag 1, len 5, "Lunia"
        "020f333030303030303030303030303033", // tag 2, len 15
        "031432303236" + "2d30392d3237" + "5430393a33303a30305a", // tag 3, len 20
        "0406" + "3131352e3030", // tag 4, "115.00"
        "0505" + "31352e3030", // tag 5, "15.00"
      ].join(""),
    );
  });

  it("reproduces the widely published ZATCA example (Salla)", () => {
    expect(
      zatcaQrBase64({
        sellerName: "Salla",
        vatNumber: "1234567891",
        timestamp: "2021-07-12T14:25:09Z",
        totalWithVat: "100.00",
        vatTotal: "15.00",
      }),
    ).toBe("AQVTYWxsYQIKMTIzNDU2Nzg5MQMUMjAyMS0wNy0xMlQxNDoyNTowOVoEBjEwMC4wMAUFMTUuMDA=");
  });

  it("uses UTF-8 byte lengths for Arabic", () => {
    const bytes = encodeTlv([[1, "لونيا"]]);
    expect(Array.from(bytes.slice(0, 2))).toEqual([1, 10]); // 5 letters × 2 bytes
    expect(Buffer.from(bytes.slice(2)).toString("hex")).toBe("d984d988d986d98ad8a7");
    expect(decodeTlv(Buffer.from(bytes).toString("base64"))).toEqual([{ tag: 1, value: "لونيا" }]);
  });

  it("rejects values over 255 bytes and formats timestamps without ms", () => {
    expect(() => encodeTlv([[1, "x".repeat(256)]])).toThrow();
    expect(zatcaTimestamp(new Date("2026-09-27T09:30:00.123Z"))).toBe("2026-09-27T09:30:00Z");
  });
});

describe("zatca/qrcode", () => {
  // Verified to decode as "HELLO" with Chrome's BarcodeDetector when written.
  const HELLO =
    "111111101001001111111|100000101111001000001|101110100010101011101|101110101010101011101|101110100001001011101|100000100001101000001|111111101010101111111|000000001001100000000|101101110101101001011|011011010111111001100|100010100101000000011|101100010001001111010|010111111000100100101|000000001111001000101|111111101001100100000|100000101010000111110|101110100000111111011|101110101011001011110|101110101100101100100|100000100010010110001|111111101010010100000";

  it("encodes a version-1 symbol exactly", () => {
    const m = encodeQr("HELLO");
    expect(m.map((r) => r.map((b) => (b ? 1 : 0)).join("")).join("|")).toBe(HELLO);
  });

  it("picks larger versions for a typical invoice payload and draws finder patterns", () => {
    const payload = zatcaQrBase64({
      sellerName: "مركز لونيا لجودة البشرة",
      vatNumber: "300000000000003",
      timestamp: "2026-09-27T09:30:00Z",
      totalWithVat: "1150.00",
      vatTotal: "150.00",
    });
    const m = encodeQr(payload);
    const size = m.length;
    expect((size - 17) % 4).toBe(0);
    expect(size).toBeGreaterThan(21);
    // Top-left finder: dark ring, light ring, dark 3×3 core.
    expect(m[0]!.slice(0, 7).every(Boolean)).toBe(true);
    expect(m[1]![1]).toBe(false);
    expect(m[3]![3]).toBe(true);
    const svg = qrToSvg(m);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain(`viewBox="0 0 ${size + 8} ${size + 8}"`);
  });
});

describe("zatca/ubl (Phase 2 readiness)", () => {
  const seller = {
    ...DEFAULT_TAX_SETTINGS,
    sellerNameAr: "مركز لونيا",
    sellerNameEn: "Lunia Center",
    vatNumber: "300000000000003",
    crNumber: "1010000000",
    buildingNo: "1234",
    street: "Prince Sultan Rd",
    district: "Al Olaya",
    city: "Riyadh",
    postalCode: "12345",
  };

  const base = {
    kind: "INVOICE" as const,
    number: "INV-2026-000001",
    uuid: "3cf5ee18-ee25-44ea-a444-2c37ba7f28be",
    issuedAt: new Date("2026-09-27T09:30:00Z"),
    counter: 1,
    previousHash: INITIAL_PIH,
    seller,
    buyer: { name: "Sara & Co <test>" },
    lines: [
      { description: "HydraFacial", qty: 1, unitPriceMinor: 43_478, discountMinor: 0, vatRateBp: 1500, netMinor: 43_478, vatMinor: 6_522, totalMinor: 50_000 },
    ],
    groups: [{ vatRateBp: 1500, taxableMinor: 43_478, vatMinor: 6_522, allowanceMinor: 0 }],
    subtotalMinor: 43_478,
    discountMinor: 0,
    vatMinor: 6_522,
    totalMinor: 50_000,
  };

  it("first PIH is base64 of the hex SHA-256 of \"0\"", () => {
    expect(INITIAL_PIH).toBe("NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==");
  });

  it("builds a simplified invoice (388 / 0200000) with ICV, PIH, seller address and totals", () => {
    const xml = buildUblXml(base);
    expect(xml.startsWith('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac=')).toBe(true);
    expect(xml).toContain("<cbc:ProfileID>reporting:1.0</cbc:ProfileID>");
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>');
    expect(xml).toContain("<cbc:IssueDate>2026-09-27</cbc:IssueDate>");
    expect(xml).toContain("<cbc:IssueTime>12:30:00</cbc:IssueTime>"); // Riyadh local time
    expect(xml).toMatch(/<cbc:ID>ICV<\/cbc:ID>\s*<cbc:UUID>1<\/cbc:UUID>/);
    expect(xml).toContain(`<cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${INITIAL_PIH}</cbc:EmbeddedDocumentBinaryObject>`);
    expect(xml).toContain('<cbc:ID schemeID="CRN">1010000000</cbc:ID>');
    expect(xml).toContain("<cbc:BuildingNumber>1234</cbc:BuildingNumber>");
    expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="SAR">500.00</cbc:TaxInclusiveAmount>');
    expect(xml).toContain('<cbc:PriceAmount currencyID="SAR">434.78</cbc:PriceAmount>');
    expect(xml).toContain("Sara &amp; Co &lt;test&gt;");
    expect(xml).not.toMatch(/<[^>]+\/>/); // canonical form: no self-closing tags
  });

  it("builds a credit note (381) with the billing reference and reason", () => {
    const xml = buildUblXml({ ...base, kind: "CREDIT_NOTE", number: "CN-2026-000001", billingReference: "INV-2026-000001", creditReason: "Returned product" });
    expect(xml).toContain('<cbc:InvoiceTypeCode name="0200000">381</cbc:InvoiceTypeCode>');
    expect(xml).toContain("<cbc:ID>INV-2026-000001</cbc:ID>");
    expect(xml).toContain("<cbc:InstructionNote>Returned product</cbc:InstructionNote>");
  });

  it("hashes as base64 SHA-256 and is deterministic", () => {
    const xml = buildUblXml(base);
    expect(invoiceHash(xml)).toBe(createHash("sha256").update(xml).digest("base64"));
    expect(buildUblXml(base)).toBe(xml);
  });

  it("Phase 2 submission is an explicit not-configured adapter", async () => {
    const s = getZatcaSubmitter();
    expect(s.configured).toBe(false);
    expect((await s.report({ invoiceId: "x", uuid: "u", hash: "h", xml: "" })).status).toBe("NOT_CONFIGURED");
  });
});
