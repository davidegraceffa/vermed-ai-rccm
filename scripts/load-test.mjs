// Burst capacity check for the spec's "~333 accepted cell updates/sec at
// peak" requirement.
//
// This is deliberately NOT a sustained-throughput generator: the cooldown
// means no single user can drive repeated accepted updates, so a realistic
// peak is many distinct users each updating around the same moment (see
// docs/ARCHITECTURE.md for the ~333 * cooldownSeconds concurrent-users
// math). So this connects CLIENTS distinct simulated users, waits for all
// of them to be connected, then fires exactly one update each in a burst
// and measures how many were accepted and how fast -- i.e. "is there
// headroom above 333/s", not "can we run at 333/s forever".
//
// Usage: TARGET_URL=http://localhost:3001 CLIENTS=400 node load-test.mjs

import { io } from "socket.io-client";

const TARGET_URL = process.env.TARGET_URL ?? "http://localhost:3001";
const CLIENT_COUNT = Number(process.env.CLIENTS ?? 400);
const GRID_WIDTH = Number(process.env.GRID_WIDTH ?? 1000);
const GRID_HEIGHT = Number(process.env.GRID_HEIGHT ?? 1000);
const TARGET_ACCEPTED_PER_SEC = 333;

function randomCell() {
  return {
    x: Math.floor(Math.random() * GRID_WIDTH),
    y: Math.floor(Math.random() * GRID_HEIGHT),
    status: Math.floor(Math.random() * 4),
  };
}

function connectClient(index) {
  return new Promise((resolve, reject) => {
    const socket = io(TARGET_URL, {
      auth: { userId: `load-test-${index}-${Date.now()}-${Math.random()}` },
      reconnection: false,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });
}

function percentile(sortedValues, p) {
  const idx = Math.min(
    sortedValues.length - 1,
    Math.floor(p * sortedValues.length),
  );
  return sortedValues[idx];
}

async function main() {
  console.log(
    `Connecting ${CLIENT_COUNT} simulated clients to ${TARGET_URL}...`,
  );
  const sockets = await Promise.all(
    Array.from({ length: CLIENT_COUNT }, (_, i) => connectClient(i)),
  );
  console.log(`All ${sockets.length} clients connected. Firing one update each in a burst...`);

  const burstStart = performance.now();
  const results = await Promise.all(
    sockets.map(
      (socket) =>
        new Promise((resolve) => {
          const cell = randomCell();
          const sentAt = performance.now();
          socket.emit("grid:update-cell", cell, (ack) => {
            resolve({ ack, latencyMs: performance.now() - sentAt });
          });
        }),
    ),
  );
  const burstDurationMs = performance.now() - burstStart;

  const accepted = results.filter((r) => r.ack.accepted);
  const rejected = results.filter((r) => !r.ack.accepted);
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const acceptedPerSecond = accepted.length / (burstDurationMs / 1000);

  console.log("");
  console.log("=== Burst capacity result ===");
  console.log(`clients:            ${CLIENT_COUNT}`);
  console.log(`accepted:           ${accepted.length}`);
  console.log(`rejected:           ${rejected.length}`);
  if (rejected.length > 0) {
    const reasons = {};
    for (const r of rejected) {
      reasons[r.ack.reason] = (reasons[r.ack.reason] ?? 0) + 1;
    }
    console.log(`rejection reasons:  ${JSON.stringify(reasons)}`);
  }
  console.log(`burst duration:     ${burstDurationMs.toFixed(1)}ms`);
  console.log(`accepted/sec:       ${acceptedPerSecond.toFixed(1)}`);
  console.log(`target (spec):      ${TARGET_ACCEPTED_PER_SEC}/sec`);
  console.log(
    `ack latency (ms):   min=${latencies[0].toFixed(1)} ` +
      `p50=${percentile(latencies, 0.5).toFixed(1)} ` +
      `p95=${percentile(latencies, 0.95).toFixed(1)} ` +
      `max=${latencies[latencies.length - 1].toFixed(1)}`,
  );

  const ok = accepted.length === CLIENT_COUNT && acceptedPerSecond >= TARGET_ACCEPTED_PER_SEC;
  console.log(
    ok
      ? "\n✓ Accept path cleared the 333/s peak target with all updates accepted."
      : "\n✗ Did not clear the 333/s peak target (or some updates were rejected) -- see above.",
  );

  for (const socket of sockets) socket.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
