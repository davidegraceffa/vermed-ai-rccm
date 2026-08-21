import { CELL_STATUS_META } from "../../constants/status";
import styles from "./Legend.module.scss";

/**
 * Static color key. Status selection now happens in the per-cell update
 * modal (opened by clicking a cell), not here -- this is read-only.
 */
export function Legend() {
  return (
    <div className={styles.legend} aria-label="Status color key">
      <span className={styles.title}>Legend</span>
      {CELL_STATUS_META.map((meta) => (
        <span key={meta.status} className={styles.item}>
          <span
            className={styles.swatch}
            style={{ background: meta.color }}
            aria-hidden="true"
          />
          {meta.label}
        </span>
      ))}
    </div>
  );
}
