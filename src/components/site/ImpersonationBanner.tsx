import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { IMPERSONATION_COOKIE, getImpersonation } from "@/modules/iam/impersonation";
import { exitCustomerView } from "./impersonationActions";

// Slim bar shown on every public page while a staff member is using "view as
// customer" (see modules/iam/impersonation.ts). Renders nothing otherwise.
// Everything done in this mode is real, so the bar says so.
export async function ImpersonationBanner({ locale }: { locale: string }) {
  const markerId = (await cookies()).get(IMPERSONATION_COOKIE)?.value;
  if (!markerId) return null;
  const record = await getImpersonation(markerId).catch(() => null);
  if (!record) return null;
  const t = await getTranslations({ locale, namespace: "impersonation" });

  return (
    <div
      role="status"
      data-testid="impersonation-banner"
      className="relative z-50 bg-[var(--color-ink)] px-4 py-2 text-[0.8rem] text-white"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">{t("viewingAs", { name: record.clientName })}</span>
          <span className="text-white/70">{t("warning")}</span>
        </p>
        <form action={exitCustomerView}>
          <button
            type="submit"
            className="min-h-9 rounded-full border border-white/40 px-4 py-1 font-medium transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {t("exit")}
          </button>
        </form>
      </div>
    </div>
  );
}
