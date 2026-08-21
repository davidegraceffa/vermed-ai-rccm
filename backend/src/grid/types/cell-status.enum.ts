export enum CellStatus {
  Normal = 0,
  Constrained = 1,
  Critical = 2,
  Unavailable = 3,
}

export interface CellStatusMeta {
  readonly status: CellStatus;
  readonly label: string;
  readonly color: string;
}

// Single source of truth on the backend; the frontend keeps a mirrored copy
// in src/constants/status.ts (documented in docs/ARCHITECTURE.md as a
// duplication we'd remove via a shared package in a real monorepo).
export const CELL_STATUS_META: readonly CellStatusMeta[] = [
  { status: CellStatus.Normal, label: "Normal", color: "#2e7d32" },
  { status: CellStatus.Constrained, label: "Constrained", color: "#f9a825" },
  { status: CellStatus.Critical, label: "Critical", color: "#e64a19" },
  { status: CellStatus.Unavailable, label: "Unavailable", color: "#616161" },
];

export function isValidCellStatus(value: unknown): value is CellStatus {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < CELL_STATUS_META.length
  );
}
