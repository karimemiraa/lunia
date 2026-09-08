// Provider adapter factory. TEMPORARY STAND-IN for Task 2: makeSender()
// currently returns stubSender for every provider so that sender.ts's
// *selection* logic (which provider to route to, based on CommsConfig) is
// complete and testable now, without any real outbound HTTP calls. Task 3
// replaces each branch's body with a real meta_whatsapp/twilio/unifonic
// HTTP adapter behind the same CommsSender interface — nothing in
// sender.ts or its callers needs to change when that happens.

import type { CommsSender } from "@/modules/booking/outbox";
import { stubSender } from "@/modules/booking/outbox";
import type { CommsConfig } from "@/modules/comms/config";

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
      // TODO(Task 3): real Meta WhatsApp Cloud API adapter using config.meta.
      return stubSender;
    case "twilio":
      // TODO(Task 3): real Twilio adapter using config.twilio.
      return stubSender;
    case "unifonic":
      // TODO(Task 3): real Unifonic adapter using config.unifonic.
      return stubSender;
    case "none":
      return stubSender;
    default:
      return assertUnreachable(config.provider);
  }
}
