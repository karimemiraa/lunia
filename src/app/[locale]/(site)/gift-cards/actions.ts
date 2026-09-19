"use server";

import { purchaseGiftCard, type PurchaseGiftInput } from "@/modules/commerce/giftShop";

export type BuyGiftResult =
  | { ok: true; code: string; amountMinor: number }
  | { ok: false; error: string };

// Public gift-card purchase. All validation + the (stubbed) payment happen in
// purchaseGiftCard; this only adapts the result for the client form.
export async function buyGiftCardAction(input: PurchaseGiftInput): Promise<BuyGiftResult> {
  try {
    const result = await purchaseGiftCard(input);
    return result;
  } catch {
    return { ok: false, error: "invalid" };
  }
}
