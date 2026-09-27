// ============================================================================
// ZATCA Phase 2 (Fatoora "integration") submission adapter — NOT CONFIGURED.
// ============================================================================
//
// Issuing already produces everything Phase 2 needs up to the signature:
// UBL 2.1 XML (Invoice.zatcaXml), UUID, ICV counter, PIH chain and invoice
// hash (see ubl.ts). Going live additionally requires, from the owner:
//   1. Fatoora portal login → generate an onboarding OTP for this EGS unit.
//   2. A CSR (secp256k1 key + ZATCA-specific subject/extensions) → compliance
//      CSID via POST /compliance, then the compliance-check invoices, then a
//      production CSID via POST /production/csids.
//   3. Per document: XAdES-B-B signature (ext:UBLExtensions + cac:Signature),
//      Phase 2 QR (tags 1–9 incl. hash, signature, public key, cert signature)
//      and POST /invoices/reporting/single (simplified invoices must be
//      reported within 24 hours).
// Implement ZatcaSubmitter against those endpoints, return it from
// getZatcaSubmitter(), and flip Invoice.zatcaStatus to REPORTED/REJECTED from
// its result. Until then every invoice stays NOT_SUBMITTED (Phase 1 — the QR
// on the printed invoice — is fully compliant on its own).

export interface ZatcaSubmitResult {
  status: "NOT_CONFIGURED" | "REPORTED" | "CLEARED" | "REJECTED";
  message: string;
  /** Raw ZATCA validation results, when a submission happened. */
  details?: unknown;
}

export interface ZatcaSubmitter {
  readonly configured: boolean;
  report(input: { invoiceId: string; uuid: string; hash: string; xml: string }): Promise<ZatcaSubmitResult>;
}

const notConfigured: ZatcaSubmitter = {
  configured: false,
  async report() {
    return {
      status: "NOT_CONFIGURED",
      message: "ZATCA Phase 2 is not configured (needs Fatoora onboarding + a production CSID).",
    };
  },
};

export function getZatcaSubmitter(): ZatcaSubmitter {
  return notConfigured;
}
