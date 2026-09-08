// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en",
}));

// `next-intl/server`'s `getTranslations` resolves to a build that throws
// outside Next's actual RSC bundler (it picks the module via a
// "react-server" export condition Vite/Vitest doesn't set). Stub it with a
// lookup straight into the real message catalogs so SiteHeader — an async
// Server Component we invoke directly below — can still be rendered here.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }: { locale: string; namespace: string }) => {
    const catalog = enMessages as unknown as Record<string, Record<string, string>>;
    const dict = catalog[namespace] ?? {};
    return (key: string) => dict[key] ?? key;
  },
}));

const { SiteHeader } = await import("@/components/site/SiteHeader");

describe("SiteHeader", () => {
  it("renders the primary nav labels and a Book Now CTA", async () => {
    // SiteHeader is an async Server Component: it can be invoked directly
    // (it's just an async function returning JSX) and the resolved element
    // rendered like any other, without needing a full Next.js App Router
    // render pipeline.
    const header = await SiteHeader({ locale: "en" });

    render(<NextIntlClientProvider locale="en" messages={enMessages}>{header}</NextIntlClientProvider>);

    for (const label of ["Home", "About", "Services", "Brands", "Results", "Journal", "Contact"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }

    const bookLinks = screen.getAllByRole("link", { name: "Book Now" });
    expect(bookLinks.length).toBeGreaterThan(0);
    expect(bookLinks[0]).toHaveAttribute("href", "/en/book");
  });

  it("localizes the nav landmarks' accessible names instead of hardcoding English", async () => {
    const header = await SiteHeader({ locale: "en" });
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        {header}
      </NextIntlClientProvider>,
    );

    const navs = screen.getAllByRole("navigation");
    expect(navs.length).toBeGreaterThan(0);
    expect(navs.map((nav) => nav.getAttribute("aria-label"))).toEqual([
      enMessages.nav.primaryLabel,
      enMessages.nav.mobileLabel,
    ]);

    // No literal "Primary" (the old hardcoded English value) should remain.
    expect(container.querySelector('nav[aria-label="Primary"]')).toBeNull();
  });

  it("positions the mobile menu panel with a valid Tailwind logical utility", async () => {
    const header = await SiteHeader({ locale: "en" });
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        {header}
      </NextIntlClientProvider>,
    );

    const panel = container.querySelector("details > div.absolute");
    expect(panel).not.toBeNull();
    expect(panel).toHaveClass("end-0");
    expect(panel?.className).not.toMatch(/inset-inline/);
  });
});
