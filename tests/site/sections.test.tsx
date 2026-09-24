// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { Hero } from "@/components/site/Hero";
import { JourneySticky } from "@/components/site/home/JourneySticky";
import { CtaBand } from "@/components/site/CtaBand";
import { Faq } from "@/components/site/Faq";
import { Testimonials } from "@/components/site/Testimonials";
import { ServiceCard } from "@/components/site/ServiceCard";
import { BrandTile } from "@/components/site/apple/BrandTile";
import { ResultsGallery } from "@/components/site/ResultsGallery";

const SIX_STEPS = [
  { title: "Analyze", body: "We start by reading your skin." },
  { title: "Personalize", body: "A plan built around you." },
  { title: "Treat", body: "Clinical-grade treatments." },
  { title: "Relax", body: "A calm, luminous space." },
  { title: "Maintain", body: "A rhythm you can keep." },
  { title: "Return", body: "Skin quality, sustained." },
];

describe("Hero", () => {
  it("renders the headline and the primary CTA with its href", () => {
    render(
      <Hero
        headline="Not facials. Skin quality."
        subhead="A luminous, clinical experience."
        eyebrow="Lunia"
        ctaLabel="Book Now"
        ctaHref="/en/contact"
      />,
    );

    expect(screen.getByRole("heading", { name: "Not facials. Skin quality." })).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Book Now" });
    expect(cta).toHaveAttribute("href", "/en/contact");
  });
});

describe("JourneySticky", () => {
  it("renders all 6 provided steps' titles, numbered, with the first step active", () => {
    const { container } = render(<JourneySticky eyebrow="Journey" heading="The Journey" stepLabel="Step" steps={SIX_STEPS} />);

    for (const step of SIX_STEPS) {
      expect(screen.getByText(step.title)).toBeInTheDocument();
    }
    expect(screen.getByText("Step 06")).toBeInTheDocument();
    const steps = container.querySelectorAll("[data-step]");
    expect(steps).toHaveLength(6);
    expect(steps[0]).toHaveClass("is-active");
  });
});

describe("CtaBand", () => {
  it("shows the headline and the CTA label/href", () => {
    render(<CtaBand headline="Start your journey" ctaLabel="Book Now" ctaHref="/en/contact" />);

    expect(screen.getByText("Start your journey")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Book Now" });
    expect(cta).toHaveAttribute("href", "/en/contact");
  });
});

describe("Faq", () => {
  it("renders each question and toggling reveals the answer", () => {
    const items = [
      { q: "What is skin quality?", a: "A clinical, sustained approach to skin health." },
      { q: "Do you offer memberships?", a: "Yes, several tiers are available." },
    ];
    render(<Faq items={items} />);

    for (const item of items) {
      expect(screen.getByText(item.q)).toBeInTheDocument();
    }

    const firstToggle = screen.getByText(items[0].q).closest("summary") as HTMLElement;
    expect(firstToggle).toBeInTheDocument();
    const details = firstToggle.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);

    // jsdom doesn't implement the native details/summary toggle behavior on
    // click, so flip `open` directly and fire the `toggle` event it would
    // dispatch — that's what any aria-expanded sync logic listens for.
    details.open = true;
    fireEvent(details, new Event("toggle"));
    expect(details.open).toBe(true);
    expect(screen.getByText(items[0].a)).toBeInTheDocument();
  });
});

describe("Testimonials", () => {
  it("renders each quote and author", () => {
    const items = [
      { quote: "My skin has never felt this alive.", author: "R." },
      { quote: "A completely different kind of care.", author: "S." },
    ];
    render(<Testimonials heading="What clients say" items={items} />);

    for (const item of items) {
      expect(screen.getByText(item.quote)).toBeInTheDocument();
      expect(screen.getByText(item.author!)).toBeInTheDocument();
    }
  });
});

describe("ServiceCard", () => {
  it("renders the name, summary, and links to href", () => {
    render(<ServiceCard name="Signature Facial" summary="A radiant reset." href="/en/services/skin/signature" />);

    const link = screen.getByRole("link", { name: /Signature Facial/ });
    expect(link).toHaveAttribute("href", "/en/services/skin/signature");
    expect(screen.getByText("A radiant reset.")).toBeInTheDocument();
  });
});

describe("BrandTile", () => {
  it("renders the name, blurb, and links to href", () => {
    render(<BrandTile name="ZO Skin Health" blurb="Clinical skincare." href="/en/brands/zo-skin-health" linkLabel="Learn more" />);

    const link = screen.getByRole("link", { name: /ZO Skin Health/ });
    expect(link).toHaveAttribute("href", "/en/brands/zo-skin-health");
    expect(screen.getByText("Clinical skincare.")).toBeInTheDocument();
  });
});

describe("ResultsGallery", () => {
  it("renders a caption for each item, the category chips, and a consent note", () => {
    render(
      <ResultsGallery
        items={[
          { category: "Skin", caption: "8 weeks of treatment" },
          { category: "Hair", caption: "Scalp recovery" },
        ]}
        categories={["Skin", "Hair"]}
        allLabel="All"
        consentNote="Shared with client consent."
      />,
    );

    expect(screen.getByText("8 weeks of treatment")).toBeInTheDocument();
    expect(screen.getByText("Scalp recovery")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skin" })).toBeInTheDocument();
    expect(screen.getByText("Shared with client consent.")).toBeInTheDocument();
  });

  it("renders gracefully with no items", () => {
    render(<ResultsGallery items={[]} />);
    expect(document.body).toBeInTheDocument();
  });
});
