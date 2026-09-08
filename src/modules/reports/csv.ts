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
//
// Formula-injection guard: a field whose serialized value starts with `=`,
// `+`, `-`, `@`, a tab, or a CR is prefixed with a single quote (`'`) before
// RFC 4180 quoting is considered. Excel/Sheets/LibreOffice all treat those
// leading characters as "this cell is a formula" when a CSV is opened, so
// without the prefix a value copied verbatim from client input (e.g. a
// client name of "=1+2" or a phone number typed as "+9665...") could execute
// as a formula in the opening spreadsheet. The leading `'` is not itself a
// CSV special character, so it never forces quoting on its own -- a field
// still only gets wrapped in double quotes if IT (with the prefix applied)
// contains a comma, a double quote, or a line break.

export interface CsvColumn {
  key: string;
  label: string;
}

const NEEDS_QUOTING = /[",\r\n]/;
const NEEDS_FORMULA_GUARD = /^[=+\-@\t\r]/;

function escapeCsvField(value: unknown): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const guarded = NEEDS_FORMULA_GUARD.test(raw) ? `'${raw}` : raw;
  if (!NEEDS_QUOTING.test(guarded)) return guarded;
  return `"${guarded.replace(/"/g, '""')}"`;
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
