import {
  useEffect,
  useRef,
  type MouseEvent,
  type RefObject,
} from "react";
import { STATUS_COLORS } from "../../constants/status";
import { hexToRgb } from "../../lib/color";
import type { ViewportRect } from "../../hooks/useViewportRect";
import type { CellUpdated } from "../../types/grid";
import styles from "./Minimap.module.scss";

const STATUS_RGB = STATUS_COLORS.map(hexToRgb);
const MINIMAP_SIZE = 140; // CSS px; grid is square so one size covers both axes

interface MinimapProps {
  width: number;
  height: number;
  cellSize: number;
  cellsRef: RefObject<Uint8Array | null>;
  viewport: ViewportRect;
  subscribeToUpdates: (cb: (cell: CellUpdated) => void) => () => void;
  subscribeToSnapshot: (cb: () => void) => () => void;
  /** Center the main viewport on the grid-pixel coordinate clicked here. */
  onNavigate: (targetX: number, targetY: number) => void;
}

/**
 * A whole-board overview, independent of current zoom: nearest-neighbor
 * downsamples the 1000x1000 data straight from cellsRef into a
 * MINIMAP_SIZE x MINIMAP_SIZE image, with a "you are here" rectangle
 * derived from the Grid viewport's scroll position/size.
 *
 * Redraws are coalesced to one per animation frame (a `dirty` flag set by
 * the update subscription, consumed by an rAF loop) rather than once per
 * incoming socket event -- at up to ~333 updates/s that would be far more
 * repaints than any display can show anyway.
 */
export function Minimap({
  width,
  height,
  cellSize,
  cellsRef,
  viewport,
  subscribeToUpdates,
  subscribeToSnapshot,
  onNavigate,
}: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dirtyRef = useRef(true);

  function draw() {
    const canvas = canvasRef.current;
    const cells = cellsRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !cells || !ctx) return;

    const image = ctx.createImageData(MINIMAP_SIZE, MINIMAP_SIZE);
    for (let my = 0; my < MINIMAP_SIZE; my++) {
      const sourceY = Math.min(
        height - 1,
        Math.floor((my / MINIMAP_SIZE) * height),
      );
      for (let mx = 0; mx < MINIMAP_SIZE; mx++) {
        const sourceX = Math.min(
          width - 1,
          Math.floor((mx / MINIMAP_SIZE) * width),
        );
        const status = cells[sourceY * width + sourceX];
        const [r, g, b] = STATUS_RGB[status] ?? STATUS_RGB[0];
        const offset = (my * MINIMAP_SIZE + mx) * 4;
        image.data[offset] = r;
        image.data[offset + 1] = g;
        image.data[offset + 2] = b;
        image.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  useEffect(() => {
    dirtyRef.current = true;
    const unsubscribeSnapshot = subscribeToSnapshot(() => {
      dirtyRef.current = true;
    });
    const unsubscribeUpdates = subscribeToUpdates(() => {
      dirtyRef.current = true;
    });

    let rafId: number;
    function loop() {
      if (dirtyRef.current) {
        draw();
        dirtyRef.current = false;
      }
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      unsubscribeSnapshot();
      unsubscribeUpdates();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  const totalPxWidth = width * cellSize;
  const totalPxHeight = height * cellSize;
  const indicatorStyle =
    totalPxWidth > 0 && totalPxHeight > 0
      ? {
          left: (viewport.scrollLeft / totalPxWidth) * MINIMAP_SIZE,
          top: (viewport.scrollTop / totalPxHeight) * MINIMAP_SIZE,
          width: Math.min(
            MINIMAP_SIZE,
            (viewport.clientWidth / totalPxWidth) * MINIMAP_SIZE,
          ),
          height: Math.min(
            MINIMAP_SIZE,
            (viewport.clientHeight / totalPxHeight) * MINIMAP_SIZE,
          ),
        }
      : { left: 0, top: 0, width: MINIMAP_SIZE, height: MINIMAP_SIZE };

  function handleClick(event: MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const fracX = (event.clientX - rect.left) / MINIMAP_SIZE;
    const fracY = (event.clientY - rect.top) / MINIMAP_SIZE;
    onNavigate(fracX * totalPxWidth, fracY * totalPxHeight);
  }

  return (
    <div className={styles.minimap} aria-label="Grid overview">
      <canvas
        ref={canvasRef}
        width={MINIMAP_SIZE}
        height={MINIMAP_SIZE}
        onClick={handleClick}
        data-testid="minimap-canvas"
      />
      <div
        className={styles.indicator}
        style={{
          left: indicatorStyle.left,
          top: indicatorStyle.top,
          width: indicatorStyle.width,
          height: indicatorStyle.height,
        }}
      />
    </div>
  );
}
