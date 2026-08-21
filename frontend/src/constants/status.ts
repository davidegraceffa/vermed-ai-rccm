// Mirrors backend/src/grid/types/cell-status.enum.ts.
// Kept in sync by hand for this exercise; a real monorepo would hoist this
// into a shared workspace package (see docs/ARCHITECTURE.md).
//
// A plain object + union type (rather than `enum`) because the frontend
// tsconfig has erasableSyntaxOnly on -- enums compile to runtime code and
// aren't allowed under that flag.
export const CellStatus = {
  Normal: 0,
  Constrained: 1,
  Critical: 2,
  Unavailable: 3,
} as const;

export type CellStatus = (typeof CellStatus)[keyof typeof CellStatus];

export interface CellStatusMeta {
  status: CellStatus;
  label: string;
  color: string;
}

export const CELL_STATUS_META: readonly CellStatusMeta[] = [
  { status: CellStatus.Normal, label: "Normal", color: "#2e7d32" },
  { status: CellStatus.Constrained, label: "Constrained", color: "#f9a825" },
  { status: CellStatus.Critical, label: "Critical", color: "#e64a19" },
  { status: CellStatus.Unavailable, label: "Unavailable", color: "#616161" },
];

export const STATUS_COLORS: readonly string[] = CELL_STATUS_META.map(
  (m) => m.color,
);

export function nextStatus(status: CellStatus): CellStatus {
  return ((status + 1) % CELL_STATUS_META.length) as CellStatus;
}
