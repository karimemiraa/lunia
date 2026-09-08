// Pure CSV serialization for the Report Center export. No I/O, no DB access
// -- just columns + rows in, a CSV string out, so it's trivially unit
// testable (see tests/reports/csv.test.ts).
//
// Escaping follows RFC 4180: a field is wrapped in double quotes if it
// contains a comma, a double quote, or a line break (CR or LF), and any
// double quote inside such a field is escaped by doubling it. Rows are
// joined with CRLF ("\r\n"), the conventional CSV line ending (and what
// Excel expects), and the header row is built from each column's `label`
// (not its `key`).

export interface CsvColumn {
  key: string;
  label: string;
}

const NEEDS_QUOTING = /[",\r\n]/;

function escapeCsvField(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  if (!NEEDS_QUOTING.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

/**
 * Renders `rows` as a CSV string with a header row built from `columns`'
 * labels, in column order. A cell is read from `row[column.key]`; a
 * missing/null/undefined value becomes an empty field rather than the
 * literal string "null"/"undefined".
 */
export function toCsv(columns: CsvColumn[], rows: Record<string, unknown>[]): string {
  const header = columns.map((column) => escapeCsvField(column.label)).join(",");
  const lines = rows.map((row) => columns.map((column) => escapeCsvField(row[column.key])).join(","));
  return [header, ...lines].join("\r\n");
}
