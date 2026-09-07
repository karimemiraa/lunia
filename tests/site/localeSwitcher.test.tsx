// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import arMessages from "@/messages/ar.json";

// `vi.mock` calls are hoisted above these imports by Vitest, so
// `currentPathname` (declared with `let` further down) is safe to close
// over here — each test just reassigns it before rendering.
let currentPathname = "/en";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
}));

const { switchLocalePath, LocaleSwitcher } = await import("@/components/site/LocaleSwitcher");

describe("switchLocalePath", () => {
  it("swaps a nested path from en to ar", () => {
    expect(switchLocalePath("/en/services/skin", "ar")).toBe("/ar/services/skin");
  });

  it("swaps a nested path from ar to en", () => {
    expect(switchLocalePath("/ar/services/skin", "en")).toBe("/en/services/skin");
  });

  it("swaps the bare locale root from en to ar", () => {
    expect(switchLocalePath("/en", "ar")).toBe("/ar");
  });

  it("swaps the bare locale root from ar to en", () => {
    expect(switchLocalePath("/ar", "en")).toBe("/en");
  });

  it("preserves a deeper path unrelated to the locale segment", () => {
    expect(switchLocalePath("/en/journal/k-beauty-101", "ar")).toBe("/ar/journal/k-beauty-101");
  });

  it("prepends the target locale when the path has no locale segment", () => {
    expect(switchLocalePath("/", "ar")).toBe("/ar");
  });
});

describe("LocaleSwitcher", () => {
  it("links to the equivalent path in the other locale, preserving it", () => {
    currentPathname = "/en/services/skin";
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <LocaleSwitcher locale="en" />
      </NextIntlClientProvider>,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/ar/services/skin");
    expect(link).toHaveTextContent("العربية");
  });

  it("renders the English label and target path when switching from ar", () => {
    currentPathname = "/ar/about";
    render(
      <NextIntlClientProvider locale="ar" messages={arMessages}>
        <LocaleSwitcher locale="ar" />
      </NextIntlClientProvider>,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/en/about");
    expect(link).toHaveTextContent("English");
  });
});
