import { NextResponse } from "next/server";
import { handleMoyasarWebhook } from "@/modules/billing/payments/links";

// Moyasar webhook + invoice callback. Authenticity and idempotency live in
// handleMoyasarWebhook (secret token + server-side re-fetch of the payment).
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  try {
    const result = await handleMoyasarWebhook(payload);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error("[moyasar webhook] failed", err);
    // 5xx so the gateway retries later.
    return NextResponse.json({ ok: false, error: "Temporary failure" }, { status: 500 });
  }
}
