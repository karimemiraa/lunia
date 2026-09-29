// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import enMessages from "@/messages/en.json";
import arMessages from "@/messages/ar.json";

let currentLocale = "en";

vi.mock("next-intl/server", () => ({
  getLocale: async () => currentLocale,
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) => {
    const catalog = (locale === "ar" ? arMessages : enMessages) as unknown as Record<string, Record<string, string>>;
    const dict = catalog[namespace] ?? {};
    return (key: string) => dict[key] ?? key;
  },
}));

const { default: NotFound } = await import("@/app/[locale]/(site)/not-found");

describe("public 404 page", () => {
  it("renders one h1, the three ways forward and locale-aware links", async () => {
    currentLocale = "en";
    render(await NotFound());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(enMessages.notFound.heading);
    expect(screen.getByRole("link", { name: enMessages.notFound.book })).toHaveAttribute("href", "/en/book");
    expect(screen.getByRole("link", { name: enMessages.notFound.home })).toHaveAttribute("href", "/en");
    expect(screen.getByRole("link", { name: enMessages.notFound.services })).toHaveAttribute("href", "/en/services");
  });

  it("uses the Arabic copy under /ar", async () => {
    currentLocale = "ar";
    render(await NotFound());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(arMessages.notFound.heading);
    expect(screen.getByRole("link", { name: arMessages.notFound.book })).toHaveAttribute("href", "/ar/book");
  });
});
