import { CELL_STATUS_META, type CellStatus } from "../../constants/status";
import styles from "./StatusPicker.module.scss";

interface StatusPickerProps {
  selected: CellStatus;
  onSelect: (status: CellStatus) => void;
}

export function StatusPicker({ selected, onSelect }: StatusPickerProps) {
  return (
    <div className={styles.picker} role="radiogroup" aria-label="New status">
      {CELL_STATUS_META.map((meta) => (
        <button
          key={meta.status}
          type="button"
          role="radio"
          aria-checked={meta.status === selected}
          className={
            meta.status === selected
              ? `${styles.item} ${styles.itemSelected}`
              : styles.item
          }
          onClick={() => onSelect(meta.status)}
          data-testid={`status-option-${meta.status}`}
        >
          <span
            className={styles.swatch}
            style={{ background: meta.color }}
            aria-hidden="true"
          />
          {meta.label}
        </button>
      ))}
    </div>
  );
}
