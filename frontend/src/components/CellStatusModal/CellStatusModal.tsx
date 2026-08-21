import { useEffect, useRef, useState, type MouseEvent } from "react";
import { StatusPicker } from "../StatusPicker/StatusPicker";
import { CELL_STATUS_META, type CellStatus } from "../../constants/status";
import styles from "./CellStatusModal.module.scss";

interface CellStatusModalProps {
  x: number;
  y: number;
  currentStatus: CellStatus;
  onConfirm: (status: CellStatus) => void;
  onCancel: () => void;
}

/**
 * Opened by clicking a cell. Lets the user pick the new status for that
 * specific cell, with a summary line spelling out the change (old status
 * -> new status, for which cell) before it's sent -- the confirmation step
 * the interaction was missing when status was pre-selected in the toolbar.
 */
export function CellStatusModal({
  x,
  y,
  currentStatus,
  onConfirm,
  onCancel,
}: CellStatusModalProps) {
  const [newStatus, setNewStatus] = useState<CellStatus>(currentStatus);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const currentMeta = CELL_STATUS_META[currentStatus];
  const newMeta = CELL_STATUS_META[newStatus];
  const isUnchanged = newStatus === currentStatus;

  function stopPropagation(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cell-modal-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={stopPropagation}
        data-testid="cell-status-modal"
      >
        <h2 id="cell-modal-title" className={styles.title}>
          Cell ({x}, {y})
        </h2>

        <div className={styles.currentRow}>
          <span className={styles.currentLabel}>Current status</span>
          <span className={styles.badge}>
            <span
              className={styles.swatch}
              style={{ background: currentMeta.color }}
              aria-hidden="true"
            />
            {currentMeta.label}
          </span>
        </div>

        <p className={styles.pickerLabel}>New status</p>
        <StatusPicker selected={newStatus} onSelect={setNewStatus} />

        <p className={styles.summary} data-testid="cell-modal-summary">
          {isUnchanged
            ? `Pick a different status to change cell (${x}, ${y}).`
            : `Cell (${x}, ${y}): ${currentMeta.label} → ${newMeta.label}`}
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            disabled={isUnchanged}
            onClick={() => onConfirm(newStatus)}
            data-testid="cell-modal-confirm"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
