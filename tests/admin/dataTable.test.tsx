// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DataTable } from "@/app/admin/_components/DataTable";

interface Row {
  id: string;
  name: string;
}

const rows: Row[] = [
  { id: "1", name: "Alpha" },
  { id: "2", name: "Beta" },
];
const columns = [{ key: "name", header: "Name" }];

describe("DataTable", () => {
  it("renders all rows and column headers by default", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r: Row) => r.id} />);

    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("filters rows client-side via the search box using the search accessor", () => {
    render(
      <DataTable columns={columns} rows={rows} rowKey={(r: Row) => r.id} searchAccessor={(r: Row) => r.name} />
    );

    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "alp" } });

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });

  it("shows an empty message when nothing matches", () => {
    render(
      <DataTable columns={columns} rows={rows} rowKey={(r: Row) => r.id} searchAccessor={(r: Row) => r.name} />
    );

    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "zzz" } });

    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("does not render a search box when no search accessor is given", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r: Row) => r.id} />);

    expect(screen.queryByPlaceholderText("Search...")).not.toBeInTheDocument();
  });
});
