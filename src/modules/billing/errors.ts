// Errors whose message is safe and meant to be shown to staff as-is.
export class BillingError extends Error {}

export class InsufficientStockError extends BillingError {
  constructor(readonly shortages: { productId: string; name: string; available: number; requested: number }[]) {
    super(`Not enough stock: ${shortages.map((s) => `${s.name} (${s.available} left, ${s.requested} needed)`).join(", ")}`);
  }
}
