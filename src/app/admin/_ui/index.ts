// Shared admin primitives ("_ui"). Server-safe pieces (StatusPill, Layout,
// FilterBar, EmptyState, money/dates) can be imported anywhere; Field, Form,
// DataTable, ConfirmDialog, RowMenu, MoneyInput and SecretInput are client
// components (import them from server pages as usual).
export * from "./money";
export * from "./dates";
export * from "./labels";
export { StatusPill, statusTone, statusLabel, type Tone } from "./StatusPill";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { SectionCard, FormSection, FormActions, KpiCard, DescriptionList, Stepper, SubNav, type Step } from "./Layout";
export { FilterBar, FilterChips, Pagination, type FilterDef, type FilterOption } from "./FilterBar";
export { DateRangeFields, DateRangeShortcuts, rangeShortcuts } from "./DateRangePicker";
export { Field, TextareaField, SelectField, CheckboxField, FieldShell, FieldError } from "./Field";
export { Form, SubmitButton, InlineStatus, Notice, Spinner, focusFirstInvalid, useUnsavedChanges } from "./Form";
export { ConfirmDialog, ConfirmButton } from "./ConfirmDialog";
export { RowMenu, type MenuItem } from "./RowMenu";
export { DataTable, toCsv, type Column, type DataTableProps, type SortDir } from "./DataTable";
export { MoneyInput } from "./MoneyInput";
export { SecretInput } from "./SecretInput";
