// ZATCA Phase 2 readiness: UBL 2.1 XML for simplified tax invoices (388) and
// credit notes (381), profile "reporting:1.0", invoice type name 0200000
// (simplified), plus the ICV counter, PIH chain and invoice hash.
//
// What is NOT here (needs the owner's Fatoora onboarding — see submit.ts):
// the XAdES signature (ext:UBLExtensions + cac:Signature) and the Phase 2 QR
// (tags 6–9). ZATCA's invoice hash is computed over the XML with exactly
// those parts removed, then C14N 1.1-canonicalized. We therefore emit the
// document already in canonical form (no XML declaration in the hashed body,
// namespace declarations in canonical order, no self-closing tags, escaped
// text), so SHA-256 of what we store is the hash ZATCA expects — PROVIDED the
// signing adapter inserts its UBLExtensions/Signature/QR elements without
// changing any other byte. Validate with the ZATCA SDK (`fatoora -validate`)
// before going live.

import { createHash } from "crypto";
import { toDecimal } from "../money";
import type { TaxSettings } from "../settings";

/** PIH of the very first document: base64 of the hex SHA-256 of "0" (ZATCA spec). */
export const INITIAL_PIH = Buffer.from(createHash("sha256").update("0").digest("hex")).toString("base64");

export interface UblLine {
  description: string;
  qty: number;
  unitPriceMinor: number;
  discountMinor: number;
  vatRateBp: number;
  netMinor: number;
  vatMinor: number;
  totalMinor: number;
}

export interface UblGroup {
  vatRateBp: number;
  taxableMinor: number;
  vatMinor: number;
  /** Document-level (invoice) discount attributed to this rate. */
  allowanceMinor: number;
}

export interface UblInput {
  kind: "INVOICE" | "CREDIT_NOTE";
  number: string;
  uuid: string;
  issuedAt: Date;
  counter: number;
  previousHash: string;
  seller: TaxSettings;
  buyer?: { name: string; vatNumber?: string | null };
  lines: UblLine[];
  groups: UblGroup[];
  subtotalMinor: number;
  discountMinor: number;
  vatMinor: number;
  totalMinor: number;
  /** Credit notes: the original invoice number and the reason (KSA-10). */
  billingReference?: string;
  creditReason?: string;
}

const NS = {
  inv: "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2",
  cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
  ext: "urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2",
};

// C14N escaping rules.
function text(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
}
function attr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/\t/g, "&#x9;")
    .replace(/\n/g, "&#xA;")
    .replace(/\r/g, "&#xD;");
}

type Node = string | { tag: string; attrs?: Record<string, string>; children?: Node[] };

function el(tag: string, children: Node[] | string | number, attrs?: Record<string, string>): Node {
  return { tag, attrs, children: Array.isArray(children) ? children : [String(children)] };
}

function render(node: Node, depth: number): string {
  if (typeof node === "string") return text(node);
  const pad = "    ".repeat(depth);
  // Canonical attribute order: lexicographic by name (none are namespaced).
  const attrs = Object.entries(node.attrs ?? {})
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => ` ${k}="${attr(v)}"`)
    .join("");
  const kids = node.children ?? [];
  if (kids.every((k) => typeof k === "string")) {
    return `${pad}<${node.tag}${attrs}>${kids.map((k) => text(k as string)).join("")}</${node.tag}>`;
  }
  return `${pad}<${node.tag}${attrs}>\n${kids.map((k) => render(k, depth + 1)).join("\n")}\n${pad}</${node.tag}>`;
}

const SAR = { currencyID: "SAR" };
const amount = (tag: string, minor: number) => el(tag, toDecimal(minor), SAR);

function percent(bp: number): string {
  return (bp / 100).toFixed(2);
}

/** Price per unit with up to 6 decimals (EN 16931 allows more than 2 on prices). */
function unitPrice(totalMinor: number, qty: number): string {
  const [whole, frac = ""] = (totalMinor / 100 / qty).toFixed(6).split(".");
  return `${whole}.${frac.replace(/0+$/, "").padEnd(2, "0")}`;
}

function taxCategory(tag: "cac:TaxCategory" | "cac:ClassifiedTaxCategory", bp: number): Node {
  const zero = bp === 0;
  const children: Node[] = [
    el("cbc:ID", zero ? "O" : "S", tag === "cac:TaxCategory" ? { schemeAgencyID: "6", schemeID: "UN/ECE 5305" } : undefined),
    el("cbc:Percent", percent(bp)),
  ];
  if (zero) {
    children.push(el("cbc:TaxExemptionReasonCode", "VATEX-SA-OOS"), el("cbc:TaxExemptionReason", "Not subject to VAT"));
  }
  children.push(
    el("cac:TaxScheme", [el("cbc:ID", "VAT", tag === "cac:TaxCategory" ? { schemeAgencyID: "6", schemeID: "UN/ECE 5153" } : undefined)]),
  );
  return el(tag, children);
}

function riyadhDateTime(d: Date): { date: string; time: string } {
  const local = new Date(d.getTime() + 3 * 3_600_000); // Asia/Riyadh, UTC+3, no DST
  const iso = local.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 19) };
}

export function buildUblXml(input: UblInput): string {
  const s = input.seller;
  const { date, time } = riyadhDateTime(input.issuedAt);
  const isCredit = input.kind === "CREDIT_NOTE";

  const header: Node[] = [
    el("cbc:ProfileID", "reporting:1.0"),
    el("cbc:ID", input.number),
    el("cbc:UUID", input.uuid),
    el("cbc:IssueDate", date),
    el("cbc:IssueTime", time),
    el("cbc:InvoiceTypeCode", isCredit ? "381" : "388", { name: "0200000" }),
    el("cbc:DocumentCurrencyCode", "SAR"),
    el("cbc:TaxCurrencyCode", "SAR"),
  ];
  if (isCredit && input.billingReference) {
    header.push(el("cac:BillingReference", [el("cac:InvoiceDocumentReference", [el("cbc:ID", input.billingReference)])]));
  }
  header.push(
    el("cac:AdditionalDocumentReference", [el("cbc:ID", "ICV"), el("cbc:UUID", String(input.counter))]),
    el("cac:AdditionalDocumentReference", [
      el("cbc:ID", "PIH"),
      el("cac:Attachment", [el("cbc:EmbeddedDocumentBinaryObject", input.previousHash, { mimeCode: "text/plain" })]),
    ]),
  );

  const address: Node[] = [el("cbc:StreetName", s.street), el("cbc:BuildingNumber", s.buildingNo)];
  if (s.additionalNo) address.push(el("cbc:PlotIdentification", s.additionalNo));
  address.push(
    el("cbc:CitySubdivisionName", s.district),
    el("cbc:CityName", s.city),
    el("cbc:PostalZone", s.postalCode),
    el("cac:Country", [el("cbc:IdentificationCode", "SA")]),
  );

  const supplier = el("cac:AccountingSupplierParty", [
    el("cac:Party", [
      el("cac:PartyIdentification", [el("cbc:ID", s.crNumber, { schemeID: "CRN" })]),
      el("cac:PostalAddress", address),
      el("cac:PartyTaxScheme", [el("cbc:CompanyID", s.vatNumber), el("cac:TaxScheme", [el("cbc:ID", "VAT")])]),
      el("cac:PartyLegalEntity", [el("cbc:RegistrationName", s.sellerNameAr.trim() || s.sellerNameEn.trim())]),
    ]),
  ]);

  const buyerParty: Node[] = [];
  if (input.buyer?.vatNumber) {
    buyerParty.push(el("cac:PartyTaxScheme", [el("cbc:CompanyID", input.buyer.vatNumber), el("cac:TaxScheme", [el("cbc:ID", "VAT")])]));
  }
  if (input.buyer?.name) buyerParty.push(el("cac:PartyLegalEntity", [el("cbc:RegistrationName", input.buyer.name)]));
  const customer = el("cac:AccountingCustomerParty", buyerParty.length ? [el("cac:Party", buyerParty)] : [""]);

  const body: Node[] = [...header, supplier, customer];

  if (isCredit) {
    body.push(
      el("cac:PaymentMeans", [el("cbc:PaymentMeansCode", "10"), el("cbc:InstructionNote", input.creditReason?.trim() || "Refund")]),
    );
  }

  for (const g of input.groups) {
    if (g.allowanceMinor <= 0) continue;
    body.push(
      el("cac:AllowanceCharge", [
        el("cbc:ChargeIndicator", "false"),
        el("cbc:AllowanceChargeReason", "discount"),
        amount("cbc:Amount", g.allowanceMinor),
        taxCategory("cac:TaxCategory", g.vatRateBp),
      ]),
    );
  }

  body.push(el("cac:TaxTotal", [amount("cbc:TaxAmount", input.vatMinor)]));
  body.push(
    el("cac:TaxTotal", [
      amount("cbc:TaxAmount", input.vatMinor),
      ...input.groups.map((g) =>
        el("cac:TaxSubtotal", [
          amount("cbc:TaxableAmount", g.taxableMinor),
          amount("cbc:TaxAmount", g.vatMinor),
          taxCategory("cac:TaxCategory", g.vatRateBp),
        ]),
      ),
    ]),
  );

  body.push(
    el("cac:LegalMonetaryTotal", [
      amount("cbc:LineExtensionAmount", input.subtotalMinor),
      amount("cbc:TaxExclusiveAmount", input.subtotalMinor - input.discountMinor),
      amount("cbc:TaxInclusiveAmount", input.totalMinor),
      amount("cbc:AllowanceTotalAmount", input.discountMinor),
      amount("cbc:PrepaidAmount", 0),
      amount("cbc:PayableAmount", input.totalMinor),
    ]),
  );

  input.lines.forEach((l, i) => {
    const price: Node[] = [el("cbc:PriceAmount", unitPrice(l.netMinor, l.qty), SAR)];
    if (l.discountMinor > 0) {
      price.push(
        el("cac:AllowanceCharge", [
          el("cbc:ChargeIndicator", "false"),
          el("cbc:AllowanceChargeReason", "discount"),
          el("cbc:Amount", unitPrice(l.discountMinor, l.qty), SAR),
          el("cbc:BaseAmount", toDecimal(l.unitPriceMinor), SAR),
        ]),
      );
    }
    body.push(
      el("cac:InvoiceLine", [
        el("cbc:ID", String(i + 1)),
        el("cbc:InvoicedQuantity", l.qty.toFixed(6), { unitCode: "PCE" }),
        amount("cbc:LineExtensionAmount", l.netMinor),
        el("cac:TaxTotal", [amount("cbc:TaxAmount", l.vatMinor), amount("cbc:RoundingAmount", l.totalMinor)]),
        el("cac:Item", [el("cbc:Name", l.description), taxCategory("cac:ClassifiedTaxCategory", l.vatRateBp)]),
        el("cac:Price", price),
      ]),
    );
  });

  // Canonical namespace order: default namespace first, then by prefix.
  const rootOpen = `<Invoice xmlns="${NS.inv}" xmlns:cac="${NS.cac}" xmlns:cbc="${NS.cbc}" xmlns:ext="${NS.ext}">`;
  return `${rootOpen}\n${body.map((n) => render(n, 1)).join("\n")}\n</Invoice>`;
}

/** Base64 SHA-256 of the canonical XML body (ZATCA "invoice hash"). */
export function invoiceHash(xmlBody: string): string {
  return createHash("sha256").update(xmlBody, "utf8").digest("base64");
}

/** The stored document: XML declaration + the hashed canonical body. */
export function withXmlDeclaration(xmlBody: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${xmlBody}`;
}
