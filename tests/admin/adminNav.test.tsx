// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdminNav } from "@/app/admin/_components/AdminNav";
import { PERMISSIONS } from "@/modules/iam/permissions";

// Sub-pages are tucked under their parent (Catalog/Media under Website,
// Reports under Business…) and render once the parent's sub-menu is opened.
// A sub-page whose parent the viewer can't see is promoted to the top level.
const expand = (href: string) => fireEvent.click(screen.getByTestId(`nav-expand-${href}`));

describe("AdminNav", () => {
  it("shows Dashboard always, and Media/Content/Catalog/Inquiries for a user with CMS_MANAGE only", () => {
    render(<AdminNav permissions={new Set([PERMISSIONS.CMS_MANAGE])} />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Website" })).toHaveAttribute("href", "/admin/content");
    // Inquiries normally sits under WhatsApp; without WhatsApp access it's top level.
    expect(screen.getByRole("link", { name: "Inquiries" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Media" })).not.toBeInTheDocument();
    expand("/admin/content");
    expect(screen.getByRole("link", { name: "Media" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Catalog" })).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Loyalty tiers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Roles" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Rooms" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Schedules" })).not.toBeInTheDocument();
  });

  it("shows Settings/Tiers for a user with SETTINGS_MANAGE", () => {
    render(<AdminNav permissions={new Set([PERMISSIONS.SETTINGS_MANAGE])} />);

    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expand("/admin/commerce");
    expect(screen.getByRole("link", { name: "Loyalty tiers" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Media" })).not.toBeInTheDocument();
  });

  it("shows Roles/Rooms/Schedules for a user with STAFF_MANAGE", () => {
    render(<AdminNav permissions={new Set([PERMISSIONS.STAFF_MANAGE])} />);

    // Rooms/Schedules live under Calendar, which this role can't see → top level.
    expect(screen.getByRole("link", { name: "Rooms" })).toBeInTheDocument();
    expand("/admin/users");
    expect(screen.getByRole("link", { name: "Roles" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Schedules" })).toBeInTheDocument();
  });

  it("shows Calendar for a user with BOOKING_VIEW", () => {
    render(<AdminNav permissions={new Set([PERMISSIONS.BOOKING_VIEW])} />);

    expect(screen.getByRole("link", { name: "Calendar" })).toBeInTheDocument();
  });

  it("shows Business/Campaigns/Reports for a user with ANALYTICS_VIEW", () => {
    render(<AdminNav permissions={new Set([PERMISSIONS.ANALYTICS_VIEW])} />);

    expect(screen.getByRole("link", { name: "Business" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Campaigns" })).toBeInTheDocument();
    expand("/admin/dashboard");
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/admin/reports");
  });

  it("hides Reports for a user without ANALYTICS_VIEW", () => {
    render(<AdminNav permissions={new Set([PERMISSIONS.CLIENT_VIEW])} />);

    expect(screen.queryByRole("link", { name: "Reports" })).not.toBeInTheDocument();
  });

  it("shows only Dashboard for a user with no elevated permissions", () => {
    render(<AdminNav permissions={new Set()} />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Calendar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Media" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Catalog" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Inquiries" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Roles" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Rooms" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Schedules" })).not.toBeInTheDocument();
  });

  it("shows open-item badges, and a collapsed parent carries its sub-pages' counts", () => {
    render(<AdminNav permissions={new Set([PERMISSIONS.CLIENT_VIEW, PERMISSIONS.CLIENT_MANAGE, PERMISSIONS.CMS_MANAGE])} badges={{ "/admin/whatsapp": 2, "/admin/inquiries": 3 }} />);
    expect(screen.getByTestId("nav-badge-/admin/whatsapp")).toHaveTextContent("5");
    expand("/admin/whatsapp");
    expect(screen.getByTestId("nav-badge-/admin/whatsapp")).toHaveTextContent("2");
    expect(screen.getByTestId("nav-badge-/admin/inquiries")).toHaveTextContent("3");
  });
});
