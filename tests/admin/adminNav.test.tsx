// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminNav } from "@/app/admin/_components/AdminNav";
import { PERMISSIONS } from "@/modules/iam/permissions";

describe("AdminNav", () => {
  it("shows Dashboard always, and Media/Content/Catalog/Inquiries for a user with CMS_MANAGE only", () => {
    render(<AdminNav permissions={new Set([PERMISSIONS.CMS_MANAGE])} />);

    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Media" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Content" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Catalog" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inquiries" })).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tiers" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Roles" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Rooms" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Schedules" })).not.toBeInTheDocument();
  });

  it("shows Settings/Tiers for a user with SETTINGS_MANAGE", () => {
    render(<AdminNav permissions={new Set([PERMISSIONS.SETTINGS_MANAGE])} />);

    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Tiers" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Media" })).not.toBeInTheDocument();
  });

  it("shows Roles/Rooms/Schedules for a user with STAFF_MANAGE", () => {
    render(<AdminNav permissions={new Set([PERMISSIONS.STAFF_MANAGE])} />);

    expect(screen.getByRole("link", { name: "Roles" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rooms" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Schedules" })).toBeInTheDocument();
  });

  it("shows Calendar for a user with BOOKING_VIEW", () => {
    render(<AdminNav permissions={new Set([PERMISSIONS.BOOKING_VIEW])} />);

    expect(screen.getByRole("link", { name: "Calendar" })).toBeInTheDocument();
  });

  it("shows Business/Marketing/Reports for a user with ANALYTICS_VIEW", () => {
    render(<AdminNav permissions={new Set([PERMISSIONS.ANALYTICS_VIEW])} />);

    expect(screen.getByRole("link", { name: "Business" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Marketing" })).toBeInTheDocument();
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
});
