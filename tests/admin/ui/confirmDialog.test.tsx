// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ConfirmButton, ConfirmDialog } from "@/app/admin/_ui/ConfirmDialog";

describe("_ui ConfirmDialog", () => {
  it("is an alertdialog labelled by its title, focuses Cancel first and traps Tab", async () => {
    vi.useFakeTimers();
    const onCancel = vi.fn();
    render(<ConfirmDialog open title="Delete room?" description="This cannot be undone." confirmLabel="Delete" danger onConfirm={() => {}} onCancel={onCancel} />);
    act(() => {
      vi.runAllTimers();
    });
    const dialog = screen.getByRole("alertdialog", { name: "Delete room?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.getAttribute("aria-describedby")).toBe(screen.getByText("This cannot be undone.").id);

    const cancel = screen.getByRole("button", { name: "Cancel" });
    const confirm = screen.getByRole("button", { name: "Delete" });
    expect(document.activeElement).toBe(cancel);
    expect(confirm.className).toContain("lunia-btn-danger");

    // Shift+Tab from the first focusable wraps to the last; Tab from the last wraps to the first.
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("returns focus to the trigger after closing", async () => {
    vi.useFakeTimers();
    function Demo() {
      return (
        <ConfirmButton title="Void this gift card?" description="The balance is lost." confirmLabel="Void" onConfirm={() => {}}>
          Void
        </ConfirmButton>
      );
    }
    render(<Demo />);
    const trigger = screen.getByRole("button", { name: "Void" });
    trigger.focus();
    fireEvent.click(trigger);
    act(() => {
      vi.runAllTimers();
    });
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
    vi.useRealTimers();
  });

  it("ConfirmButton submits its form only after confirmation", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <ConfirmButton title="Delete user?" confirmLabel="Delete">
          Delete
        </ConfirmButton>
      </form>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("alertdialog").querySelector("button.lunia-btn-danger")!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
