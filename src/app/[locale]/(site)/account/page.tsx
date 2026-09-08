import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/site/Section";
import { buildMetadata } from "@/modules/seo/metadata";
import { localized } from "@/modules/catalog/localize";
import { prisma } from "@/lib/db";
import { listBookings } from "@/modules/booking/bookings";
import { getClientSessionUser, CLIENT_SESSION_COOKIE } from "@/modules/iam/clientAuth";
import type { PublicLocale } from "@/modules/cms/publicContent";
import { AccountBookings, type AccountBookingDTO } from "./AccountBookings";
import { logout } from "./actions";

interface AccountPageProps {
  params: Promise<{ locale: string }>;
}

const MIN_HOURS_BEFORE_CANCEL = 24;
const CANCELLABLE_STATUSES = new Set(["REQUESTED", "CONFIRMED", "CHECKED_IN"]);

function isPublicLocale(locale: string): locale is PublicLocale {
  return locale === "ar" || locale === "en";
}

interface BookingWithServiceName {
  id: string;
  status: string;
  appointments: { startAt: Date; serviceId: string }[];
}

// Splits this client's bookings into upcoming/past buckets and works out
// per-booking cancel eligibility. Pulled out of the page component (which
// must stay a pure render function) since it reads the current wall-clock
// time — an impure read that's fine in a plain server-side helper called
// once per request, just not inline in component body.
function classifyBookings(
  bookings: BookingWithServiceName[],
  serviceById: Map<string, { nameEn: string; nameAr: string }>,
  locale: PublicLocale,
): { upcoming: AccountBookingDTO[]; past: AccountBookingDTO[] } {
  const now = Date.now();
  const upcoming: AccountBookingDTO[] = [];
  const past: AccountBookingDTO[] = [];

  for (const booking of bookings) {
    const appointment = booking.appointments[0];
    if (!appointment) continue;

    const service = serviceById.get(appointment.serviceId);
    const serviceName = service ? localized(locale, service.nameEn, service.nameAr) : "";

    const isUpcoming = appointment.startAt.getTime() >= now && booking.status !== "CANCELLED" && booking.status !== "NO_SHOW";
    const hoursUntilStart = (appointment.startAt.getTime() - now) / (60 * 60 * 1000);
    const canCancel =
      isUpcoming &&
      CANCELLABLE_STATUSES.has(booking.status) &&
      hoursUntilStart > MIN_HOURS_BEFORE_CANCEL;

    const dto: AccountBookingDTO = {
      id: booking.id,
      serviceName,
      startAtIso: appointment.startAt.toISOString(),
      status: booking.status as AccountBookingDTO["status"],
      canCancel,
    };

    if (isUpcoming) {
      upcoming.push(dto);
    } else {
      past.push(dto);
    }
  }

  return { upcoming, past };
}

export async function generateMetadata({ params }: AccountPageProps): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const [tMetaEn, tMetaAr] = await Promise.all([
    getTranslations({ locale: "en", namespace: "account.meta" }),
    getTranslations({ locale: "ar", namespace: "account.meta" }),
  ]);

  return buildMetadata({
    locale,
    path: "/account",
    titleEn: tMetaEn("title"),
    titleAr: tMetaAr("title"),
    descEn: tMetaEn("description"),
    descAr: tMetaAr("description"),
  });
}

export default async function AccountPage({ params }: AccountPageProps) {
  const { locale: rawLocale } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const token = (await cookies()).get(CLIENT_SESSION_COOKIE)?.value;
  const sessionUser = token ? await getClientSessionUser(token) : null;
  if (!sessionUser) {
    redirect(`/${locale}/account/login`);
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    include: { clientProfile: true },
  });
  if (!user || !user.clientProfile) {
    redirect(`/${locale}/account/login`);
  }

  const bookings = await listBookings({ clientProfileId: user.clientProfile.id });

  const serviceIds = [...new Set(bookings.flatMap((booking) => booking.appointments.map((a) => a.serviceId)))];
  const services = await prisma.service.findMany({ where: { id: { in: serviceIds } } });
  const serviceById = new Map(services.map((service) => [service.id, service]));

  const { upcoming, past } = classifyBookings(bookings, serviceById, locale);

  const t = await getTranslations({ locale, namespace: "account" });
  const logoutAction = logout.bind(null, locale);

  return (
    <main className="flex flex-col">
      <Section tone="plain">
        <div className="flex flex-col gap-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-2 text-start">
              <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)] sm:text-4xl">
                {t("heading")}
              </h1>
              {user.clientProfile.fullName ? (
                <p className="text-sm text-[var(--color-ink)]/65">
                  {t("signedInAs", { name: user.clientProfile.fullName })}
                </p>
              ) : null}
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-[var(--color-ink)]/20 px-6 py-2.5 text-sm font-medium tracking-wide text-[var(--color-ink)] transition-colors hover:bg-[var(--color-ink)]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-teal)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-page)]"
              >
                {t("logoutLabel")}
              </button>
            </form>
          </div>

          <AccountBookings locale={locale} upcoming={upcoming} past={past} />
        </div>
      </Section>
    </main>
  );
}
