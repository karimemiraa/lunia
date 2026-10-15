import type { T } from "../../_i18n/t";

// Audience labels come from src/modules/comms/broadcast.ts in English ("All
// customers", "<tier> tier") and are stored on the broadcast as-is; this only
// localizes how they are shown.
export function audienceDisplay(label: string, t: T): string {
  const tier = /^(.*) tier$/.exec(label);
  return tier ? t("{name} tier", { name: tier[1] }) : t(label);
}
