// ZATCA Phase 1 QR payload: Base64 of a TLV (tag-length-value) byte string.
//   tag 1 seller name · 2 VAT registration no. · 3 invoice timestamp (ISO 8601)
//   tag 4 invoice total incl. VAT · 5 VAT total
// Lengths are UTF-8 BYTE lengths (an Arabic seller name is ~2 bytes/letter),
// one byte each, so a value may be at most 255 bytes.

export interface ZatcaQrFields {
  sellerName: string;
  vatNumber: string;
  /** ISO 8601, e.g. "2026-09-27T09:30:00Z". */
  timestamp: string;
  /** Decimal string, e.g. "115.00". */
  totalWithVat: string;
  /** Decimal string, e.g. "15.00". */
  vatTotal: string;
}

export function encodeTlv(entries: [tag: number, value: string][]): Uint8Array {
  const parts: number[] = [];
  const enc = new TextEncoder();
  for (const [tag, value] of entries) {
    const bytes = enc.encode(value);
    if (bytes.length > 255) throw new Error(`TLV tag ${tag} is longer than 255 bytes`);
    parts.push(tag, bytes.length, ...bytes);
  }
  return Uint8Array.from(parts);
}

export function decodeTlv(base64: string): { tag: number; value: string }[] {
  const bytes = Buffer.from(base64, "base64");
  const out: { tag: number; value: string }[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < bytes.length; ) {
    const tag = bytes[i]!;
    const len = bytes[i + 1]!;
    out.push({ tag, value: dec.decode(bytes.subarray(i + 2, i + 2 + len)) });
    i += 2 + len;
  }
  return out;
}

export function zatcaQrBase64(f: ZatcaQrFields): string {
  const tlv = encodeTlv([
    [1, f.sellerName],
    [2, f.vatNumber],
    [3, f.timestamp],
    [4, f.totalWithVat],
    [5, f.vatTotal],
  ]);
  return Buffer.from(tlv).toString("base64");
}

/** ZATCA timestamp: ISO 8601 UTC without milliseconds. */
export function zatcaTimestamp(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}
