import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getOrCreateUserId } from "../lib/userId";
import type { CellUpdated, GridSnapshot, UpdateCellAck } from "../types/grid";

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3001";

type CellListener = (cell: CellUpdated) => void;

/**
 * Owns the socket connection and the raw cell buffer.
 *
 * The 1,000,000-cell buffer is kept in a ref, NOT React state: pushing
 * every incoming update (up to ~333/s) through setState would mean a full
 * component re-render per cell, which the <Grid> canvas doesn't need --
 * it draws imperatively. Instead, listeners subscribe directly and repaint
 * only the changed pixel(s).
 */
export function useGridSocket() {
  const socketRef = useRef<Socket | null>(null);
  const cellsRef = useRef<Uint8Array | null>(null);
  const listenersRef = useRef<Set<CellListener>>(new Set());
  const snapshotListenersRef = useRef<Set<() => void>>(new Set());

  // Computed once (lazy initializer), not re-generated on re-render; also
  // what's sent as the socket handshake auth below. Exposed so the UI can
  // show it -- see docs/ARCHITECTURE.md "Simplified auth" for why this is
  // an unverified, client-declared id rather than a real identity.
  const [userId] = useState(() => getOrCreateUserId());

  const [connected, setConnected] = useState(false);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Read inside the (single-subscription) socket event handler below
  // without forcing that effect to re-run when dimensions change.
  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      auth: { userId },
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("grid:snapshot", (snapshot: GridSnapshot) => {
      cellsRef.current = new Uint8Array(snapshot.cells as ArrayBuffer);
      setDimensions({ width: snapshot.width, height: snapshot.height });
      snapshotListenersRef.current.forEach((cb) => cb());
    });

    // The server batches accepted updates into one event on an interval
    // (see GridGateway.pendingBroadcast) rather than emitting per cell --
    // at the spec's ~333 accepted updates/s peak, one socket.io message
    // per update to every connected client would be the real bottleneck,
    // not the accept path itself. Downstream listeners (Grid, Minimap)
    // still get a per-cell callback each; only the wire format is batched.
    socket.on("grid:cells-updated", (batch: CellUpdated[]) => {
      const cells = cellsRef.current;
      const width = dimensionsRef.current?.width;
      for (const cell of batch) {
        if (cells && width) {
          cells[cell.y * width + cell.x] = cell.status;
        }
        listenersRef.current.forEach((cb) => cb(cell));
      }
    });

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function subscribeToUpdates(cb: CellListener): () => void {
    listenersRef.current.add(cb);
    return () => listenersRef.current.delete(cb);
  }

  function subscribeToSnapshot(cb: () => void): () => void {
    snapshotListenersRef.current.add(cb);
    return () => snapshotListenersRef.current.delete(cb);
  }

  function requestUpdate(
    x: number,
    y: number,
    status: number,
  ): Promise<UpdateCellAck> {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket) {
        reject(new Error("Socket not connected"));
        return;
      }
      socket.emit("grid:update-cell", { x, y, status }, (ack: UpdateCellAck) =>
        resolve(ack),
      );
    });
  }

  return {
    connected,
    userId,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    cellsRef,
    subscribeToUpdates,
    subscribeToSnapshot,
    requestUpdate,
  };
}
