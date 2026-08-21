import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CellStatus } from "./types/cell-status.enum";

/**
 * Simulated persistence layer.
 *
 * A 1000x1000 grid of small integer status codes fits in a single
 * Uint8Array (1,000,000 bytes = ~1MB), so it lives entirely in process
 * memory. This is the "fake mocked db" for the exercise: no reviewer setup
 * required, and swapping it for a real store later only means implementing
 * this same read/write interface against Redis/Postgres (see
 * docs/ARCHITECTURE.md).
 */
@Injectable()
export class GridService {
  readonly width: number;
  readonly height: number;
  private readonly cells: Uint8Array;

  constructor(private readonly config: ConfigService) {
    this.width = Number(this.config.get("GRID_WIDTH", "1000"));
    this.height = Number(this.config.get("GRID_HEIGHT", "1000"));
    this.cells = new Uint8Array(this.width * this.height).fill(
      CellStatus.Normal,
    );
  }

  isInBounds(x: number, y: number): boolean {
    return (
      Number.isInteger(x) &&
      Number.isInteger(y) &&
      x >= 0 &&
      y >= 0 &&
      x < this.width &&
      y < this.height
    );
  }

  getCell(x: number, y: number): CellStatus {
    return this.cells[y * this.width + x] as CellStatus;
  }

  setCell(x: number, y: number, status: CellStatus): void {
    this.cells[y * this.width + x] = status;
  }

  /** Full snapshot sent once, on connection. */
  snapshot(): Uint8Array {
    return this.cells;
  }
}
