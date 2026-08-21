import styles from "./ZoomControl.module.scss";

export const ZOOM_PRESETS_PX = [2, 4, 8, 16, 24, 32] as const;

interface ZoomControlProps {
  cellSize: number;
  onChange: (cellSize: number) => void;
}

/**
 * The full 1000x1000 board rendered at a readable cell size is far bigger
 * than any viewport (see Grid.tsx), so the grid pans via native scroll and
 * zooms via this control, which just changes how many CSS pixels each
 * cell occupies. The color canvas's backing resolution never changes with
 * zoom (see Grid.tsx), so these presets aren't bounded by canvas memory --
 * capped at 32 mainly to keep the scrollable content (up to 32,000px on a
 * side) from getting unwieldy, not for a technical reason.
 */
export function ZoomControl({ cellSize, onChange }: ZoomControlProps) {
  const index = ZOOM_PRESETS_PX.indexOf(
    cellSize as (typeof ZOOM_PRESETS_PX)[number],
  );

  function step(delta: number) {
    const nextIndex = Math.min(
      ZOOM_PRESETS_PX.length - 1,
      Math.max(0, index + delta),
    );
    onChange(ZOOM_PRESETS_PX[nextIndex]);
  }

  return (
    <div className={styles.zoom}>
      <span className={styles.label}>Zoom ({cellSize}px/cell)</span>
      <div className={styles.buttons}>
        <button
          type="button"
          onClick={() => step(-1)}
          disabled={index <= 0}
          aria-label="Zoom out"
        >
          &minus;
        </button>
        <button
          type="button"
          onClick={() => step(1)}
          disabled={index >= ZOOM_PRESETS_PX.length - 1}
          aria-label="Zoom in"
        >
          +
        </button>
      </div>
    </div>
  );
}
