// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders label and primary variant class", () => {
    render(<Button variant="primary">Book Now</Button>);
    const el = screen.getByRole("button", { name: "Book Now" });
    expect(el.className).toContain("bg-[var(--color-teal)]");
  });
});
