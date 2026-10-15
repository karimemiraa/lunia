"use client";

import { useActionState, useState } from "react";
import { saveLoyaltyRatesAction, type TierActionState } from "./actions";
import { InlineStatus } from "../_ui/Form";
import { useStaffT } from "../_i18n/StaffI18n";

const initialState: TierActionState = {};

interface LoyaltyRatesFormProps {
  /** Current SAR-of-spend that earns 1 point. */
  sarPerPoint: number;
  /** Current points needed for 1 SAR of discount. */
  pointsPerSar: number;
}

// Configures the loyalty economics ("how much money for what points"). Shown
// above the tier table since tiers and points are the same programme.
export function LoyaltyRatesForm({ sarPerPoint, pointsPerSar }: LoyaltyRatesFormProps) {
  const t = useStaffT();
  const [state, action, pending] = useActionState(saveLoyaltyRatesAction, initialState);
  const [earn, setEarn] = useState(String(sarPerPoint));
  const [redeem, setRedeem] = useState(String(pointsPerSar));

  const redeemNum = Number(redeem);
  const pointValueSar = Number.isFinite(redeemNum) && redeemNum >= 1 ? (1 / redeemNum).toFixed(3) : "—";

  return (
    <form action={action} className="lunia-card flex flex-col gap-4 p-6" data-testid="loyalty-rates-form">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">{t("Points & money setup")}</h2>
        <p className="text-sm text-[var(--color-ink)]/60">
          {t("Decide how customers earn points from what they spend, and how much a point is worth when redeemed.")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("SAR spent to earn 1 point")}</span>
          <input
            type="number"
            name="sarPerPoint"
            value={earn}
            onChange={(e) => setEarn(e.target.value)}
            min="0.1"
            step="0.1"
            required
            className="lunia-input"
          />
          <span className="text-xs text-[var(--color-ink)]/55">
            {t("e.g. 1 → a customer earns 1 point for every 1 SAR they spend.")}
          </span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-[var(--color-ink)]">{t("Points needed for 1 SAR discount")}</span>
          <input
            type="number"
            name="pointsPerSar"
            value={redeem}
            onChange={(e) => setRedeem(e.target.value)}
            min="1"
            step="1"
            required
            className="lunia-input"
          />
          <span className="text-xs text-[var(--color-ink)]/55">
            {t("e.g. 100 → each point is worth {value} SAR at checkout.", { value: pointValueSar })}
          </span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="lunia-btn lunia-btn-forest disabled:opacity-60">
          {pending ? t("Saving…") : t("Save rates")}
        </button>
        <InlineStatus size="sm" success={state.success ? t("Saved.") : undefined} />
        <InlineStatus size="sm" error={state.error} />
      </div>
    </form>
  );
}
