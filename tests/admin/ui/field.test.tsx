// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Field, SelectField, TextareaField } from "@/app/admin/_ui/Field";
import { Form } from "@/app/admin/_ui/Form";
import { MoneyInput } from "@/app/admin/_ui/MoneyInput";

describe("_ui Field", () => {
  it("links the label, helper text and error to the input via aria-describedby", () => {
    const { rerender } = render(<Field label="Phone" name="phone" type="tel" help="Include the country code" />);
    const input = screen.getByLabelText("Phone");
    expect(input).toHaveAttribute("type", "tel");
    const help = screen.getByText("Include the country code");
    expect(input.getAttribute("aria-describedby")).toBe(help.id);
    expect(input).not.toHaveAttribute("aria-invalid");

    rerender(<Field label="Phone" name="phone" type="tel" help="Include the country code" error="Enter a valid phone number" />);
    const err = screen.getByRole("alert");
    expect(err).toHaveTextContent("Enter a valid phone number");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe(err.id);
    // Help text yields to the error so the description stays short.
    expect(screen.queryByText("Include the country code")).not.toBeInTheDocument();
  });

  it("shows a required marker and validates on blur using native constraints", () => {
    render(<Field label="Email" name="email" type="email" required />);
    const input = screen.getByLabelText(/email/i) as HTMLInputElement;
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
    fireEvent.change(input, { target: { value: "not-an-email" } });
    fireEvent.blur(input);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(input, { target: { value: "a@b.co" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Form focuses the first invalid field on submit and blocks submission", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <Form onSubmit={onSubmit}>
        <Field label="Name" name="name" required />
        <Field label="Email" name="email" type="email" required />
        <button type="submit">Save</button>
      </Form>,
    );
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText(/name/i));
    expect(screen.getAllByRole("alert")).toHaveLength(2);

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Lina" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "lina@x.co" } });
    fireEvent.click(screen.getByText("Save"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("SelectField and TextareaField are labelled", () => {
    render(
      <>
        <SelectField label="Role" name="role">
          <option value="a">A</option>
        </SelectField>
        <TextareaField label="Notes" name="notes" help="Printed on the invoice" />
      </>,
    );
    expect(screen.getByLabelText("Role").tagName).toBe("SELECT");
    const ta = screen.getByLabelText("Notes");
    expect(ta.tagName).toBe("TEXTAREA");
    expect(ta.getAttribute("aria-describedby")).toBe(screen.getByText("Printed on the invoice").id);
  });

  it("MoneyInput reports halalas and rejects malformed amounts on blur", () => {
    const onChange = vi.fn();
    render(<MoneyInput label="Amount" onChange={onChange} vat="incl" />);
    const input = screen.getByLabelText("Amount") as HTMLInputElement;
    expect(input).toHaveAttribute("inputmode", "decimal");
    fireEvent.change(input, { target: { value: "1,249.50" } });
    expect(onChange).toHaveBeenLastCalledWith("1,249.50", 124950);
    fireEvent.change(input, { target: { value: "12.345" } });
    fireEvent.blur(input);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an amount like 250 or 249.50.");
    expect(screen.getByText("incl. VAT")).toBeInTheDocument();
  });
});
