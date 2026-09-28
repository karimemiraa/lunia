// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { DataTable, toCsv, type Column } from "@/app/admin/_ui/DataTable";

interface Row {
  id: string;
  name: string;
  total: number;
  when: Date;
}

const rows: Row[] = [
  { id: "1", name: "Beta", total: 250, when: new Date("2026-03-02T00:00:00Z") },
  { id: "2", name: "alpha", total: 1000, when: new Date("2026-03-01T00:00:00Z") },
  { id: "3", name: "Gamma", total: 50, when: new Date("2026-03-03T00:00:00Z") },
];
const columns: Column<Row>[] = [
  { key: "name", header: "Name" },
  { key: "total", header: "Total", numeric: true, render: (r) => `${r.total}.00 SAR` },
  { key: "when", header: "When", render: (r) => r.when.toISOString().slice(0, 10) },
];

function bodyCells(col: number) {
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((tr) => within(tr).getAllByRole("cell")[col]!.textContent);
}

describe("_ui DataTable", () => {
  it("renders headers with aria-sort=none and sorts ascending, descending, then clears", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} pageSize={0} />);
    const header = screen.getByRole("columnheader", { name: /name/i });
    expect(header).toHaveAttribute("aria-sort", "none");

    fireEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "ascending");
    expect(bodyCells(0)).toEqual(["alpha", "Beta", "Gamma"]);

    fireEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "descending");
    expect(bodyCells(0)).toEqual(["Gamma", "Beta", "alpha"]);

    fireEvent.click(within(header).getByRole("button"));
    expect(header).toHaveAttribute("aria-sort", "none");
    expect(bodyCells(0)).toEqual(["Beta", "alpha", "Gamma"]);
  });

  it("sorts numbers numerically and dates chronologically", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} pageSize={0} />);
    fireEvent.click(within(screen.getByRole("columnheader", { name: /total/i })).getByRole("button"));
    expect(bodyCells(1)).toEqual(["50.00 SAR", "250.00 SAR", "1000.00 SAR"]);
    fireEvent.click(within(screen.getByRole("columnheader", { name: /when/i })).getByRole("button"));
    expect(bodyCells(2)).toEqual(["2026-03-01", "2026-03-02", "2026-03-03"]);
  });

  it("right-aligns numeric columns with tabular numerals", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} pageSize={0} />);
    const cell = within(screen.getByRole("table")).getAllByRole("cell")[1]!;
    expect(cell.className).toContain("text-end");
    expect(cell.className).toContain("tabular-nums");
  });

  it("filters via search and shows an actionable empty state", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} search={(r) => r.name} empty={{ title: "No invoices yet", action: { label: "New invoice", href: "/admin/billing/new" } }} />);
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "gam" } });
    expect(bodyCells(0)).toEqual(["Gamma"]);
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "zzz" } });
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("renders the empty state action when there are no rows", () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} empty={{ title: "No invoices yet", action: { label: "New invoice", href: "/admin/billing/new" } }} />);
    expect(screen.getByRole("link", { name: "New invoice" })).toHaveAttribute("href", "/admin/billing/new");
  });

  it("paginates with a page size selector", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ id: String(i), name: `Row ${i}`, total: i, when: new Date() }));
    render(<DataTable columns={columns} rows={many} rowKey={(r) => r.id} pageSize={10} pageSizes={[10, 25]} />);
    expect(bodyCells(0)).toHaveLength(10);
    expect(screen.getByText("1–10 of 12")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(bodyCells(0)).toHaveLength(2);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "25" } });
    expect(bodyCells(0)).toHaveLength(12);
  });

  it("exposes row actions through an accessible menu", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} pageSize={0} rowActions={() => [{ label: "Edit", onSelect: () => {} }, { label: "Delete", danger: true, onSelect: () => {} }]} />);
    const trigger = screen.getAllByRole("button", { name: "Row actions" })[0]!;
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Edit", "Delete"]);
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("supports bulk selection", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} pageSize={0} selectable bulkActions={(sel) => <span>{sel.length} chosen</span>} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows on this page" }));
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.getByText("3 chosen")).toBeInTheDocument();
  });

  it("builds CSV from plain values", () => {
    expect(toCsv(columns, rows.slice(0, 1))).toBe('Name,Total,When\nBeta,250,2026-03-02T00:00:00.000Z');
  });
});
