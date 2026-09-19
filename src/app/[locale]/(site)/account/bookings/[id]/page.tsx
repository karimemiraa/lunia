import Link from "next/link";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Section } from "@/components/site/Section";
import { prisma } from "@/lib/db";
import { getBooking } from "@/modules/booking/bookings";
import { localized } from "@/modules/catalog/localize";
import { getClientSessionUser, CLIENT_SESSION_COOKIE } from "@/modules/iam/clientAuth";
import type { PublicLocale } from "@/modules/cms/publicContent";
import { BookingNoteForm } from "./BookingNoteForm";

interface BookingDetailPageProps {
  params: Promise<{ locale: string; id: string }>;
}

function isPublicLocale(locale: string): locale is PublicLocale {
  return locale === "ar" || locale === "en";
}

const CENTER_TZ = "Asia/Riyadh";

function formatDateTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", {
    timeZone: CENTER_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatSar(priceMinor: number, locale: string): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(priceMinor / 100);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-[var(--color-ink)]/10 py-3 last:border-b-0">
      <dt className="text-xs font-medium uppercase tracking-[0.1em] text-[var(--color-ink)]/45">{label}</dt>
      <dd className="text-base text-[var(--color-ink)]">{value}</dd>
    </div>
  );
}

export default async function BookingDetailPage({ params }: BookingDetailPageProps) {
  const { locale: rawLocale, id } = await params;
  const locale: PublicLocale = isPublicLocale(rawLocale) ? rawLocale : "ar";

  const token = (await cookies()).get(CLIENT_SESSION_COOKIE)?.value;
  const sessionUser = token ? await getClientSessionUser(token) : null;
  if (!sessionUser) {
    redirect(`/${locale}/account/login`);
  }

  const profile = await prisma.clientProfile.findUnique({ where: { userId: sessionUser.id } });
  if (!profile) {
    redirect(`/${locale}/account/login`);
  }

  const booking = await getBooking(id);
  // SECURITY: never reveal a booking that isn't this client's — treat it as
  // not found, exactly like cancelMyBooking's ownership check.
  if (!booking || booking.clientProfileId !== profile.id) {
    notFound();
  }

  const appointment = booking.appointments[0];
  if (!appointment) notFound();

  const [service, staff, room, t] = await Promise.all([
    prisma.service.findUnique({ where: { id: appointment.serviceId } }),
    prisma.user.findUnique({ where: { id: appointment.staffUserId }, include: { staffProfile: true } }),
    prisma.room.findUnique({ where: { id: appointment.roomId } }),
    getTranslations({ locale, namespace: "account" }),
  ]);

  const serviceName = service ? localized(locale, service.nameEn, service.nameAr) : "—";
  const staffName = staff?.staffProfile?.fullName ?? "—";
  const roomName = room?.name ?? "—";

  return (
    <main className="flex flex-col">
      <Section tone="plain">
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-2">
            <Link
              href={`/${locale}/account`}
              className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-[var(--color-ink)]/70 transition-colors hover:text-[var(--color-ink)]"
            >
              <span aria-hidden="true">{locale === "ar" ? "→" : "←"}</span>
              {t("detail.back")}
            </Link>
            <h1 className="font-[family-name:var(--font-display)] text-3xl text-[var(--color-ink)] sm:text-4xl">
              {serviceName}
            </h1>
            <span className="w-fit rounded-full bg-[var(--color-ink)]/5 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-ink)]/70">
              {t(`status.${booking.status}`)}
            </span>
          </div>

          <dl className="rounded-2xl border border-[var(--color-ink)]/10 bg-[var(--color-page)] px-6 py-2">
            <Row label={t("detail.date")} value={formatDateTime(appointment.startAt, locale)} />
            <Row label={t("detail.service")} value={serviceName} />
            <Row label={t("detail.staff")} value={staffName} />
            <Row label={t("detail.room")} value={roomName} />
            <Row label={t("detail.status")} value={t(`status.${booking.status}`)} />
            {appointment.priceMinorSnapshot > 0 && (
              <Row label={t("detail.price")} value={formatSar(appointment.priceMinorSnapshot, locale)} />
            )}
          </dl>

          {booking.centerNote && (
            <div className="flex flex-col gap-2 rounded-2xl border border-[var(--color-teal)]/40 bg-[var(--color-teal)]/[0.07] p-6">
              <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">
                {t("detail.centerNoteHeading")}
              </h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-ink)]/85">{booking.centerNote}</p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl text-[var(--color-ink)]">
              {t("detail.customerNoteHeading")}
            </h2>
            <BookingNoteForm locale={locale} bookingId={booking.id} initialNote={booking.customerNote ?? ""} />
          </div>
        </div>
      </Section>
    </main>
  );
}
