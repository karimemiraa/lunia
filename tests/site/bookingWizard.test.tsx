// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";

const getSlots = vi.fn();
const startOtp = vi.fn();

vi.mock("@/app/[locale]/(site)/book/actions", () => ({
  getSlots: (...args: unknown[]) => getSlots(...args),
  startOtp: (...args: unknown[]) => startOtp(...args),
  verifyAndBook: vi.fn(),
  getMyActivePackages: vi.fn(async () => []),
  applyPackageToBookingAction: vi.fn(),
  joinWaitlistAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/components/analytics/Tracker", () => ({ trackEvent: vi.fn() }));

const { BookingWizard, BOOKING_DRAFT_KEY } = await import("@/app/[locale]/(site)/book/BookingWizard");

const services = [
  { id: "svc-1", name: "Diagnostic Skin Analysis", departmentName: "Skin", durationMin: 45, priceMinor: 25000, tierNote: null },
  { id: "svc-2", name: "Scalp Ritual", departmentName: "Hair", durationMin: 60, priceMinor: 40000, tierNote: "Gold" },
];

function renderWizard() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <BookingWizard services={services} locale="en" sourceChannel="direct" />
    </NextIntlClientProvider>,
  );
}

const slotAt = (iso: string) => ({ startAt: iso, staffUserId: "staff-1", roomId: "room-1" });

describe("BookingWizard", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    getSlots.mockReset();
    startOtp.mockReset();
  });

  it("shows a four-step indicator with the current step marked", () => {
    renderWizard();
    const nav = screen.getByRole("navigation", { name: /step 1 of 4/i });
    const items = nav.querySelectorAll("li");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveAttribute("aria-current", "step");
    // Nothing is completed yet, so no step is a back-navigation button.
    expect(nav.querySelectorAll("button")).toHaveLength(0);
  });

  it("turns completed steps into back-navigation buttons and saves a draft", async () => {
    getSlots.mockResolvedValue({ ok: true, slots: [] });
    renderWizard();
    fireEvent.click(screen.getByText("Diagnostic Skin Analysis"));

    expect(await screen.findByTestId("booking-step-datetime")).toBeInTheDocument();
    const back = screen.getByTestId("booking-step-link-1");
    expect(back).toHaveAttribute("aria-label", "Go back to Service");
    expect(screen.getByTestId("booking-sticky-summary")).toHaveTextContent("Diagnostic Skin Analysis");

    // The selection survives a reload via sessionStorage.
    const draft = JSON.parse(window.sessionStorage.getItem(BOOKING_DRAFT_KEY) ?? "null");
    expect(draft).toMatchObject({ step: 2, serviceId: "svc-1" });

    fireEvent.click(back);
    expect(await screen.findByTestId("booking-step-service")).toBeInTheDocument();
  });

  it("restores a saved draft on mount", async () => {
    getSlots.mockResolvedValue({ ok: true, slots: [slotAt("2030-01-05T07:00:00.000Z")] });
    window.sessionStorage.setItem(
      BOOKING_DRAFT_KEY,
      JSON.stringify({ step: 2, serviceId: "svc-2", dateISO: null, slot: null, name: "Sara", identifier: "" }),
    );
    renderWizard();
    expect(await screen.findByTestId("booking-step-datetime")).toBeInTheDocument();
    expect(screen.getByTestId("booking-restored")).toBeInTheDocument();
    expect(screen.getByTestId("booking-sticky-summary")).toHaveTextContent("Scalp Ritual");
  });

  it("offers next available days and the waitlist when a day has no slots", async () => {
    getSlots.mockImplementation(async (_service: string, dateISO: string) => {
      // The chosen day is full; the day after has a slot.
      const [y, m, d] = dateISO.split("-").map(Number);
      const isFirstPick = getSlots.mock.calls.length === 1;
      return isFirstPick ? { ok: true, slots: [] } : { ok: true, slots: [slotAt(new Date(Date.UTC(y!, m! - 1, d!, 7)).toISOString())] };
    });
    renderWizard();
    fireEvent.click(screen.getByText("Diagnostic Skin Analysis"));
    const firstDay = (await screen.findAllByRole("button", { pressed: false })).find((b) => b.hasAttribute("data-date"))!;
    fireEvent.click(firstDay);

    expect(await screen.findByTestId("booking-no-slots")).toBeInTheDocument();
    expect(screen.getByTestId("booking-waitlist-form")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("booking-next-available").querySelectorAll("button").length).toBeGreaterThan(0));
  });

  it("validates the contact fields inline on blur and blocks sending", async () => {
    getSlots.mockResolvedValue({ ok: true, slots: [slotAt("2030-01-05T07:00:00.000Z")] });
    renderWizard();
    fireEvent.click(screen.getByText("Diagnostic Skin Analysis"));
    const firstDay = (await screen.findAllByRole("button")).find((b) => b.hasAttribute("data-date"))!;
    fireEvent.click(firstDay);
    const slot = await screen.findByText((_, el) => el?.hasAttribute("data-slot-time") ?? false);
    fireEvent.click(slot);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByTestId("booking-step-contact")).toBeInTheDocument();

    const identifier = screen.getByLabelText("Phone or email");
    fireEvent.change(identifier, { target: { value: "not a phone" } });
    fireEvent.blur(identifier);
    expect(await screen.findByText(enMessages.book.errors.invalidIdentifier)).toBeInTheDocument();
    expect(identifier).toHaveAttribute("aria-invalid", "true");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send verification code" }));
    });
    expect(startOtp).not.toHaveBeenCalled();
    expect(screen.getByText(enMessages.book.errors.nameRequired)).toBeInTheDocument();
  });
});
