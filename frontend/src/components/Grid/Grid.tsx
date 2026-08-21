import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
} from "react";
import { STATUS_COLORS } from "../../constants/status";
import { hexToRgb } from "../../lib/color";
import type { CellUpdated } from "../../types/grid";
import styles from "./Grid.module.scss";

const STATUS_RGB = STATUS_COLORS.map(hexToRgb);
const DRAG_THRESHOLD_PX = 4;
const MIN_CELL_SIZE_FOR_LINES = 3; // below this, lines are just noise

interface GridProps {
  width: number;
  height: number;
  /** On-screen size of one cell, in CSS pixels. Controls zoom level. */
  cellSize: number;
  cellsRef: RefObject<Uint8Array | null>;
  /** Owned by the parent so the Minimap can read scroll position/size too. */
  viewportRef: RefObject<HTMLDivElement | null>;
  subscribeToUpdates: (cb: (cell: CellUpdated) => void) => () => void;
  subscribeToSnapshot: (cb: () => void) => () => void;
  onCellClick: (x: number, y: number) => void;
}

interface HoverCell {
  x: number;
  y: number;
  clientX: number;
  clientY: number;
}

/**
 * The color layer is a <canvas> at the DATA resolution (1000x1000 backing
 * pixels) regardless of zoom, scaled up on screen via CSS
 * (image-rendering: pixelated). Full redraws are one putImageData call and
 * incremental updates a single-pixel fillRect -- both cheap and, unlike a
 * fill()'d Path2D built from a million rects (tried first; rasterized
 * unreliably), proven to just work.
 *
 * Cell-boundary grid lines are a plain CSS repeating background pattern on
 * an overlay div, not a second canvas: a canvas's backing buffer is
 * allocated at its pixel dimensions regardless of what's drawn on it, so a
 * canvas sized to the full zoomed-out board (width*cellSize on a side)
 * would cost real memory as cellSize grows (8000x8000 is already ~256MB).
 * A CSS background-size pattern tiles on the GPU at whatever cellSize,
 * with no such ceiling -- which is what makes a wide zoom range safe here.
 *
 * Panning is drag-to-scroll (like a map) on the viewport container, on
 * top of native scroll/trackpad support; a small movement threshold
 * distinguishes a drag from a click that should select a cell.
 */
export function Grid({
  width,
  height,
  cellSize,
  cellsRef,
  viewportRef,
  subscribeToUpdates,
  subscribeToSnapshot,
  onCellClick,
}: GridProps) {
  const canvasStackRef = useRef<HTMLDivElement>(null);
  const colorCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hover, setHover] = useState<HoverCell | null>(null);

  const dragState = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
    moved: boolean;
  } | null>(null);

  function drawColorFull() {
    const canvas = colorCanvasRef.current;
    const cells = cellsRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !cells || !ctx) return;

    const image = ctx.createImageData(width, height);
    for (let i = 0; i < cells.length; i++) {
      const [r, g, b] = STATUS_RGB[cells[i]] ?? STATUS_RGB[0];
      const offset = i * 4;
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }

  function drawColorCell(cell: CellUpdated) {
    const ctx = colorCanvasRef.current?.getContext("2d");
    if (!ctx) return;
    const [r, g, b] = STATUS_RGB[cell.status] ?? STATUS_RGB[0];
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(cell.x, cell.y, 1, 1);
  }

  useEffect(() => {
    drawColorFull();
    const unsubscribeSnapshot = subscribeToSnapshot(drawColorFull);
    const unsubscribeUpdates = subscribeToUpdates(drawColorCell);
    return () => {
      unsubscribeSnapshot();
      unsubscribeUpdates();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  function cellFromPointer(clientX: number, clientY: number) {
    const stack = canvasStackRef.current;
    if (!stack) return null;
    const rect = stack.getBoundingClientRect();
    const x = Math.min(
      width - 1,
      Math.max(0, Math.floor((clientX - rect.left) / cellSize)),
    );
    const y = Math.min(
      height - 1,
      Math.max(0, Math.floor((clientY - rect.top) / cellSize)),
    );
    return { x, y };
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
      moved: false,
    };
    viewport.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    const viewport = viewportRef.current;

    if (drag && viewport && drag.pointerId === event.pointerId) {
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;

      if (!drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        drag.moved = true;
        setIsDragging(true);
        setHover(null);
      }
      if (drag.moved) {
        viewport.scrollLeft = drag.startScrollLeft - dx;
        viewport.scrollTop = drag.startScrollTop - dy;
      }
    }

    if (!drag?.moved) {
      const cell = cellFromPointer(event.clientX, event.clientY);
      if (cell) {
        setHover({
          x: cell.x,
          y: cell.y,
          clientX: event.clientX,
          clientY: event.clientY,
        });
      }
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    const viewport = viewportRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    viewport?.releasePointerCapture(event.pointerId);
    if (!drag.moved) {
      const cell = cellFromPointer(event.clientX, event.clientY);
      if (cell) onCellClick(cell.x, cell.y);
    }
    dragState.current = null;
    setIsDragging(false);
  }

  const showLines = cellSize >= MIN_CELL_SIZE_FOR_LINES;

  return (
    <div
      ref={viewportRef}
      className={
        isDragging ? `${styles.viewport} ${styles.dragging}` : styles.viewport
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={() => setHover(null)}
    >
      <div
        ref={canvasStackRef}
        className={styles.canvasStack}
        style={{ width: width * cellSize, height: height * cellSize }}
      >
        <canvas
          ref={colorCanvasRef}
          width={width}
          height={height}
          className={styles.colorCanvas}
          style={{ width: width * cellSize, height: height * cellSize }}
          data-testid="grid-canvas"
        />
        {showLines && (
          <div
            className={styles.lineOverlay}
            style={{
              backgroundSize: `${cellSize}px ${cellSize}px`,
            }}
          />
        )}
      </div>

      {hover && !isDragging && (
        <div
          className={styles.tooltip}
          style={{ left: hover.clientX + 14, top: hover.clientY + 14 }}
        >
          Cell ({hover.x}, {hover.y})
        </div>
      )}
    </div>
  );
}
