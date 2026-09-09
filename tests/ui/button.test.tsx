// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders label and primary variant class", () => {
    render(<Button variant="primary">Book Now</Button>);
    const el = screen.getByRole("button", { name: "Book Now" });
    // Primary buttons carry the shared design-system classes (styling lives in
    // globals.css .lunia-btn/.lunia-btn-primary).
    expect(el.className).toContain("lunia-btn");
    expect(el.className).toContain("lunia-btn-primary");
  });
});
