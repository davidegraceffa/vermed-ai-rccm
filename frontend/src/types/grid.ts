export interface GridSnapshot {
  width: number;
  height: number;
  cells: ArrayBuffer | Uint8Array;
}

export interface CellUpdated {
  x: number;
  y: number;
  status: number;
}

export interface UpdateCellAck {
  accepted: boolean;
  reason?: "OUT_OF_BOUNDS" | "INVALID_STATUS" | "COOLDOWN_ACTIVE";
  retryAfterMs?: number;
  cell?: CellUpdated;
}
