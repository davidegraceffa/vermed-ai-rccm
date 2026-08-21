import { io } from "socket.io-client";

const URL = process.env.TARGET_URL ?? "http://localhost:3001";

function byteLength(value) {
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return null;
}

const connectStart = performance.now();
const socket = io(URL, { auth: { userId: `measure-${Date.now()}` } });

socket.once("connect", () => {
  const connectMs = performance.now() - connectStart;
  console.log(`connected in ${connectMs.toFixed(1)}ms`);
});

socket.once("grid:snapshot", (snapshot) => {
  const receivedAt = performance.now();
  const totalMs = receivedAt - connectStart;
  const cellsBytes = byteLength(snapshot.cells);
  console.log(`snapshot received ${totalMs.toFixed(1)}ms after connect() call`);
  console.log(`width=${snapshot.width} height=${snapshot.height}`);
  console.log(`cells payload: ${cellsBytes} bytes (${(cellsBytes / 1024).toFixed(1)} KiB)`);
  socket.disconnect();
  process.exit(0);
});

setTimeout(() => {
  console.error("timed out waiting for snapshot");
  process.exit(1);
}, 10000);
