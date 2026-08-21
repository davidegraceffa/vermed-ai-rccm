import { useRef, useState } from "react";
import { CellStatusModal } from "./components/CellStatusModal/CellStatusModal";
import { Grid } from "./components/Grid/Grid";
import { Legend } from "./components/Legend/Legend";
import { Minimap } from "./components/Minimap/Minimap";
import { Snackbar } from "./components/Snackbar/Snackbar";
import {
  ZOOM_PRESETS_PX,
  ZoomControl,
} from "./components/ZoomControl/ZoomControl";
import { CellStatus } from "./constants/status";
import { useGridSocket } from "./hooks/useGridSocket";
import { useViewportRect } from "./hooks/useViewportRect";
import type { UpdateCellAck } from "./types/grid";
import styles from "./App.module.scss";

interface PendingCell {
  x: number;
  y: number;
  currentStatus: CellStatus;
}

export function App() {
  const {
    connected,
    userId,
    width,
    height,
    cellsRef,
    subscribeToUpdates,
    subscribeToSnapshot,
    requestUpdate,
  } = useGridSocket();

  const viewportRef = useRef<HTMLDivElement>(null);
  const viewportRect = useViewportRect(viewportRef, width && height);

  const [cellSize, setCellSize] = useState<number>(ZOOM_PRESETS_PX[1]);
  const [pendingCell, setPendingCell] = useState<PendingCell | null>(null);
  const [lastAck, setLastAck] = useState<UpdateCellAck | null>(null);
  const [ackToken, setAckToken] = useState(0);

  function handleCellClick(x: number, y: number) {
    if (!width) return;
    const currentStatus = (cellsRef.current?.[y * width + x] ??
      CellStatus.Normal) as CellStatus;
    setPendingCell({ x, y, currentStatus });
  }

  async function handleConfirmUpdate(newStatus: CellStatus) {
    if (!pendingCell) return;
    const { x, y } = pendingCell;
    setPendingCell(null);
    const ack = await requestUpdate(x, y, newStatus);
    setLastAck(ack);
    setAckToken((token) => token + 1);
  }

  function handleMinimapNavigate(targetX: number, targetY: number) {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = targetX - viewport.clientWidth / 2;
    viewport.scrollTop = targetY - viewport.clientHeight / 2;
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1>Regional Care Capacity Map</h1>
        <p className={styles.subtitle}>
          Synthetic capacity grid &mdash; {width ?? "?"}&times;{height ?? "?"}{" "}
          cells
          <span
            className={
              connected ? styles.connectionOk : styles.connectionWarn
            }
          >
            {" "}
            &bull; {connected ? "connected" : "connecting..."}
          </span>
          <span
            className={styles.userIdBadge}
            title={`${userId} — unverified, self-declared id stored in this browser's localStorage; keys your cooldown (see docs/ARCHITECTURE.md)`}
          >
            {" "}
            &bull; your id: {userId.slice(0, 8)}
          </span>
        </p>
      </header>

      <div className={styles.toolbar}>
        <ZoomControl cellSize={cellSize} onChange={setCellSize} />
        <Legend />
      </div>

      <main className={styles.main}>
        {width && height ? (
          <div className={styles.gridWrapper}>
            <Grid
              width={width}
              height={height}
              cellSize={cellSize}
              cellsRef={cellsRef}
              viewportRef={viewportRef}
              subscribeToUpdates={subscribeToUpdates}
              subscribeToSnapshot={subscribeToSnapshot}
              onCellClick={handleCellClick}
            />
            <Minimap
              width={width}
              height={height}
              cellSize={cellSize}
              cellsRef={cellsRef}
              viewport={viewportRect}
              subscribeToUpdates={subscribeToUpdates}
              subscribeToSnapshot={subscribeToSnapshot}
              onNavigate={handleMinimapNavigate}
            />
          </div>
        ) : (
          <p>Loading grid...</p>
        )}
      </main>

      {pendingCell && (
        <CellStatusModal
          x={pendingCell.x}
          y={pendingCell.y}
          currentStatus={pendingCell.currentStatus}
          onConfirm={handleConfirmUpdate}
          onCancel={() => setPendingCell(null)}
        />
      )}

      {lastAck && <Snackbar key={ackToken} ack={lastAck} />}
    </div>
  );
}
