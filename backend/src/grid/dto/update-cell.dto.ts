export interface UpdateCellDto {
  x: number;
  y: number;
  status: number;
}

export interface UpdateCellAck {
  accepted: boolean;
  reason?: "OUT_OF_BOUNDS" | "INVALID_STATUS" | "COOLDOWN_ACTIVE";
  retryAfterMs?: number;
  cell?: { x: number; y: number; status: number };
}
