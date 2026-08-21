import { useEffect, useState } from "react";
import type { UpdateCellAck } from "../../types/grid";
import styles from "./Snackbar.module.scss";

const AUTO_DISMISS_MS = 4000;

const REASON_MESSAGES: Record<
  NonNullable<UpdateCellAck["reason"]>,
  (ack: UpdateCellAck) => string
> = {
  OUT_OF_BOUNDS: () => "That cell is outside the grid.",
  INVALID_STATUS: () => "Unknown status.",
  COOLDOWN_ACTIVE: (ack) =>
    `You're in cooldown. Try again in ${Math.ceil(
      (ack.retryAfterMs ?? 0) / 1000,
    )}s.`,
};

interface SnackbarProps {
  ack: UpdateCellAck;
}

/**
 * Transient toast for the result of a single update request. Mount a new
 * instance per ack (parent passes `key={ackToken}`) so each rejection or
 * confirmation gets its own fresh auto-dismiss timer, even if the message
 * text repeats (e.g. two cooldown rejections in a row).
 */
export function Snackbar({ ack }: SnackbarProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const message = ack.accepted
    ? `Update accepted at (${ack.cell?.x}, ${ack.cell?.y}).`
    : ack.reason
      ? REASON_MESSAGES[ack.reason](ack)
      : "Update rejected.";

  return (
    <div
      role={ack.accepted ? "status" : "alert"}
      className={
        ack.accepted
          ? `${styles.snackbar} ${styles.ok}`
          : `${styles.snackbar} ${styles.error}`
      }
      data-testid="status-banner"
    >
      {message}
    </div>
  );
}
