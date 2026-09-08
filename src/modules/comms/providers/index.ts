// Provider adapter factory. Builds the real fetch-based CommsSender for
// whichever provider CommsConfig selects. sender.ts only calls this once its
// own selection logic (production + configured) has decided a real provider
// should be used; callers never invoke this for provider "none" or an
// unconfigured provider, but each branch still falls back to stubSender if
// its config sub-object is unexpectedly missing (defense in depth — the
// exhaustiveness guard below only covers the outer provider union).

import type { CommsSender } from "@/modules/booking/outbox";
import { stubSender } from "@/modules/booking/outbox";
import type { CommsConfig } from "@/modules/comms/config";
import { makeMetaSender } from "@/modules/comms/providers/meta";
import { makeTwilioSender } from "@/modules/comms/providers/twilio";
import { makeUnifonicSender } from "@/modules/comms/providers/unifonic";

// Exhaustiveness guard: CommsProvider is a closed union, so passing
// anything but `never` here is a compile error — this makes an unhandled
// provider case in makeSender's switch a build-time failure instead of a
// silent runtime fallback.
function assertUnreachable(value: never): CommsSender {
  void value;
  return stubSender;
}

// Builds the CommsSender for `config.provider`. Only called once selection
// logic (sender.ts) has already decided a real provider should be used
// (production + configured); callers never invoke this for provider "none"
// or an unconfigured provider.
export function makeSender(config: CommsConfig): CommsSender {
  switch (config.provider) {
    case "meta_whatsapp":
      if (!config.meta) return stubSender;
      return makeMetaSender({ ...config.meta, from: config.from });
    case "twilio":
      if (!config.twilio) return stubSender;
      return makeTwilioSender(config.twilio);
    case "unifonic":
      if (!config.unifonic) return stubSender;
      return makeUnifonicSender(config.unifonic);
    case "none":
      return stubSender;
    default:
      return assertUnreachable(config.provider);
  }
}
