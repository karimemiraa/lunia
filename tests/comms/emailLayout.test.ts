import { describe, it, expect } from "vitest";
import { renderEmailHtml } from "@/modules/comms/emailLayout";

describe("renderEmailHtml", () => {
  it("wraps the body in the branded shell (wordmark, tagline, footer)", () => {
    const html = renderEmailHtml({ subject: "Welcome", body: "Thanks for joining." });
    expect(html).toContain("LUNIA");
    expect(html).toContain("Skin Quality Center");
    expect(html).toContain("Thanks for joining.");
    expect(html).toContain("do not reply");
  });

  it("greets the recipient by name when provided", () => {
    const html = renderEmailHtml({ subject: "Hi", body: "Body.", recipientName: "Sara" });
    expect(html).toContain("Hi Sara,");
  });

  it("omits the greeting when no name is given", () => {
    const html = renderEmailHtml({ subject: "Hi", body: "Body." });
    expect(html).not.toContain("Hi ,");
    expect(html).not.toMatch(/>Hi\s*,/);
  });

  it("promotes a standalone 6-digit code into a prominent code block", () => {
    const html = renderEmailHtml({ subject: "Code", body: "123456" });
    expect(html).toContain("123456");
    expect(html).toContain("letter-spacing:8px");
  });

  it("splits an inline code sentence around the code block without leaving a gap", () => {
    const html = renderEmailHtml({
      subject: "Code",
      body: "Your Lunia verification code is 486213. It is valid for 5 minutes.",
    });
    expect(html).toContain("Your Lunia verification code is");
    expect(html).toContain("It is valid for 5 minutes.");
    // The code is lifted out of the sentence — no dangling "is ." fragment.
    expect(html).not.toContain("is . It is valid");
    expect(html).not.toContain("is  It is valid");
  });

  it("escapes HTML in the body", () => {
    const html = renderEmailHtml({ subject: "x", body: "<script>alert(1)</script>" });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders right-to-left for Arabic locale", () => {
    const html = renderEmailHtml({ subject: "مرحبا", body: "أهلاً بك", locale: "ar" });
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("text-align:right");
  });

  it("uses the subject as the preheader by default", () => {
    const html = renderEmailHtml({ subject: "Booking confirmed", body: "Details." });
    expect(html).toContain("Booking confirmed");
  });
});
