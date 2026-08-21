# Architecture

This document explains the design decisions behind the Regional Care Capacity Map prototype, what's real vs. simulated, and what a production build would change. It assumes you've read the top-level `README.md` for how to run the app.

## What works now / what's simulated / what's next

| Area | Now (this repo) | Simulated | Production next step |
|---|---|---|---|
| Grid storage | In-memory `Uint8Array(1,000,000)` in `GridService` | Acts as the "database" | Real store (e.g. Postgres or Redis) shared across instances |
| Cooldown | In-memory `Map<userId, timestamp>` in `CooldownService` | Per-process, resets on restart | Redis key per user with `PX`/`NX` TTL — atomic across instances |
| Auth | Client-generated random id in `localStorage`, sent as socket handshake `auth` | Not verified at all | Real session/JWT; gateway reads the verified id, not a client-supplied one |
| Broadcast | Batched every `BROADCAST_BATCH_MS` (see below) | Single Node process, single Socket.IO server | Redis pub/sub adapter (`@socket.io/redis-adapter`) so broadcasts reach clients connected to *other* instances |
| CORS | `origin: true` (reflects any origin) | Fine for localhost / a single trusted deployment | Env-driven allow-list |
| Deployment | One backend + one frontend process, run locally | — | Horizontal scaling of the backend behind a load balancer, sticky sessions or the Redis adapter above |
| Initial grid load | Full 1M-cell snapshot pushed on every connect | Fine at this size (see below) | Viewport/tile-based loading against an indexed store — mandatory if grid size or concurrency grows |

## Interpreting "~333 accepted cell updates/sec at peak"

The spec doesn't say whether this is per-user, per-cell, or system-wide, or whether it needs to be sustained indefinitely. The reading used throughout this build:

- **System-wide aggregate**, not per-user — a single user is already capped at one accepted update per cooldown window, so 333/s can only be reached by many distinct users acting around the same time.
- **A peak capacity ceiling the accept path must clear**, not a rate the system needs to run at continuously. Concretely: what the accept path (cooldown check + grid write) needs to handle without becoming the bottleneck, proven with a burst test rather than a sustained generator (see below).
- Tied to the cooldown, it implies a concurrency assumption: sustaining 333 *accepted* updates/sec with a 10s cooldown requires roughly `333 × 10 ≈ 3,330` distinct active users in that window — a useful sanity check on what "peak" actually means for this exercise, since a single user can't get anywhere near 333/s no matter how fast they click.

## Where the real bottleneck is: broadcast fan-out, not the accept path

The accept path itself — validate bounds/status, check the cooldown map, write one entry into a `Uint8Array` — is O(1) and trivially fast; a single Node process clears many thousands of these per second (see load test results below).

The actual risk at a 333/s peak is **fan-out**: naively calling `server.emit(...)` once per accepted update means every accepted update becomes one Socket.IO message *to every connected client*. With `C` connected clients, that's `333 × C` outbound messages/sec from a single-threaded Node process — not just a network cost, but `333 × C` `emit()` calls competing with the accept path on the same event loop.

### The fix: time-based broadcast batching

`GridGateway` (`backend/src/grid/grid.gateway.ts`) buffers accepted updates in a `Map` keyed by cell index (so if the same cell is updated twice within a window, only the latest status survives) and flushes it on a `setInterval`, not per update:

```ts
private flushBroadcastBatch(): void {
  if (this.pendingBroadcast.size === 0) return;
  const batch = Array.from(this.pendingBroadcast.values());
  this.pendingBroadcast.clear();
  this.server.emit("grid:cells-updated", batch);
}
```

- **Purely time-based**, not count-based: it flushes every `BROADCAST_BATCH_MS` (default 75ms, `backend/.env.example`) regardless of how many updates accumulated — 1 or 1,000. There's no "flush after N updates" threshold.
- The **accept path is unaffected** — the requester still gets an immediate, synchronous ack (`{accepted, reason?, ...}`) over the same request; batching only touches the broadcast to *other* clients.
- One real nuance worth being explicit about: because the sender's own canvas repaints from the same `grid:cells-updated` broadcast (not from the ack), the sender also sees their own pixel update land up to `BROADCAST_BATCH_MS` after clicking Confirm — the *confirmation message* is instant, the *pixel* has the same small delay as everyone else's view.

**Does this still count as "real-time"?** In practice, yes: ~100ms is the commonly cited threshold below which a UI reads as instantaneous to a human. At a 75ms interval the worst-case added latency is under that, while cutting outbound message volume dramatically.

**Verified, not just claimed** — two runs against the local dev backend:

1. Batching effect: 300 accepted updates from 300 distinct simulated clients arrived at an observer client as **5 `grid:cells-updated` events, not 300** (~60× fewer outbound messages).
2. Accept-path capacity: `scripts/load-test.mjs` connects 400 distinct simulated users, waits for all to be connected, then fires one update each in a burst (see the "Interpreting 333/s" section above for why a burst of distinct users, not one user hammering the endpoint, is the realistic peak scenario) —

   ```
   clients:            400
   accepted:           400
   rejected:           0
   burst duration:     133.6ms
   accepted/sec:       2994.3
   target (spec):      333/sec
   ack latency (ms):   min=23.1 p50=26.4 p95=117.9 max=119.6
   ```

   ~9× the 333/s target with zero rejections and sub-30ms median ack latency. Run it yourself with `pnpm run load-test` (backend must be running; `CLIENTS` and `TARGET_URL` are overridable env vars).

**Known trade-off, left as-is by choice:** at low traffic (the common case — an update every few seconds), batching adds up to `BROADCAST_BATCH_MS` of latency for zero efficiency benefit, since the buffer will almost always contain just one cell. This is accepted deliberately: it's a scalability decision justified by the spec's peak-load number, not an average-case optimization. A better-tuned version would flush near-immediately after a quiet period and only fall back to the fixed interval during a genuine burst (a debounce-with-max-wait pattern) — noted here as a next step rather than built, since the fixed interval already satisfies the requirement and keeps the implementation simple to reason about.

## Grid rendering

The board is rendered on `<canvas>`, not 1,000,000 DOM nodes, split into two layers (`frontend/src/components/Grid/Grid.tsx`):

- **Color layer**: backing resolution fixed at the *data* resolution (1000×1000 pixels) regardless of zoom, scaled up on screen via CSS (`image-rendering: pixelated`). A full redraw is one `putImageData` call; an incremental update is a single-pixel `fillRect`. This stays cheap at any zoom level because the backing buffer never grows.
- **Grid lines**: a CSS `background-image` repeating-gradient pattern on an overlay `div`, not a second canvas. This was a deliberate correction — an earlier version used a canvas sized to `width × cellSize` for the lines, and a canvas's backing buffer is allocated at its pixel dimensions *regardless of what's drawn on it*: at a high zoom level (e.g. 32px/cell) that's a 32,000×32,000 buffer, on the order of 1GB, just sitting there. The CSS pattern tiles on the GPU at any `cellSize` with no such ceiling, which is what made raising the max zoom preset safe.
- A first attempt at the color layer itself used a single `Path2D` built from a million individual `.rect()` calls, filled once. It rasterized unreliably — filled correctly in some manual tests and silently produced a fully transparent canvas in others, with no error thrown. Root-caused via direct browser console experiments (documented in commit history / session, not reproduced here) and replaced with the `putImageData`/`fillRect` approach above, which has been reliable throughout.

Panning is drag-to-scroll on the viewport container (native scroll/trackpad also work), with a small movement threshold to distinguish a pan from a click that should open the update modal. A minimap (`frontend/src/components/Minimap/Minimap.tsx`) shows a nearest-neighbor-downsampled overview of the whole board with a "you are here" rectangle tracking the main viewport's scroll position, plus click-to-recenter.

## Initial grid load: full snapshot now, tiling required at scale

On every connection, `GridGateway.handleConnection` sends the entire board in one `grid:snapshot` event (`backend/src/grid/grid.gateway.ts`) — the whole `Uint8Array`, not a viewport slice. Measured against the local dev backend, not estimated:

- **Wire payload:** 1,000,000 bytes (976.6 KiB) of raw cell data, transferred in ~1ms on localhost (`scripts/measure-snapshot.mjs`).
- **Client paint cost:** building the `ImageData` from those 1M cells and calling `putImageData` takes **~83ms on the main thread** (measured with the exact code path from `Grid.tsx`, run directly against the live canvas) — a one-time, synchronous hitch on connect and on every reconnect, independent of network speed.

**Decision: kept as full-load for this exercise, deliberately.** At 1,000×1,000 cells the cost is real but bounded, infrequent (only on connect/reconnect — the batched broadcast in the previous section means it never recurs per update), and doesn't currently block anything else. Optimizing it now (compressing the transport, packing 2 bits/cell instead of 8, chunking the paint across frames) would each shave the numbers above without changing the shape of the problem.

**Why that would stop being true at scale, and why the fix isn't incremental:** the cost of a full snapshot is `O(total cells)`, paid by *every connecting client*, regardless of what that client can actually see. That's fine at 1M cells; it does not hold if the board grows (more regions, finer resolution) or if concurrency grows (the ~3,330 concurrent users implied by a 333/s peak, all connecting/reconnecting in the same window, is `3,330 × 976 KiB ≈ 3.2GB` of burst egress from a single process). Compression or bit-packing buy a constant-factor improvement (4–10×) on the same fundamentally-wrong shape; they delay the problem, they don't remove it.

**The actual production requirement: viewport/tile-based loading against an indexed store.** A client should request only the cells intersecting its current viewport (+ a small margin for panning), the way map tile servers work, not the whole board:

- Requires a real, queryable store (not the in-memory `Uint8Array`) with an index that makes "give me cells where `x` and `y` fall in this range" cheap — e.g. a composite index on `(region_id, tile_x, tile_y)`, or a spatial index (PostGIS `GiST`, or an equivalent) if the data model grows beyond a flat grid.
- Changes the protocol from "push everything on connect" to a request/response (or subscribe-to-region) pattern, and ties into the batched-broadcast design above: a client should only be notified of updates to cells inside a region it's actually subscribed to, not the whole board's traffic.
- The minimap (`frontend/src/components/Minimap/Minimap.tsx`) would need its own data source at that point — it currently downsamples straight from the full client-side buffer, which won't exist anymore once the client only holds its own viewport's data. A pre-aggregated low-resolution summary (akin to a map's zoomed-out tile layer) would replace it.

This is flagged as **mandatory before the grid size or concurrency assumptions of this exercise change**, not as a nice-to-have — it's a different architecture, not a tuning pass on this one.

## Simplified auth

There is no real authentication. The flow, end to end:

1. **Frontend** (`frontend/src/lib/userId.ts`): on first load, generates a `crypto.randomUUID()` and stores it in `localStorage` under `rccm.userId`. Later visits read the existing value instead of generating a new one — it persists across refreshes and is shared across tabs of the same browser (`localStorage` is per-origin, not per-tab), but it identifies *a browser*, not a verified person.
2. **Handshake**: that id is sent as the Socket.IO connection's `auth` payload (`useGridSocket.ts`): `io(SOCKET_URL, { auth: { userId } })`.
3. **Backend** (`grid.gateway.ts`, `handleConnection`): reads it straight off the handshake and trusts it outright —

   ```ts
   const userId =
     (client.handshake.auth?.["userId"] as string | undefined) ?? client.id;
   client.data.userId = userId;
   ```

   No verification, no signature check, nothing stopping a client from sending an arbitrary string. It's stored on `client.data.userId` for the life of that connection.
4. **Cooldown key** (`cooldown.service.ts`): every update request reads `client.data.userId` and uses it as the key into `lastAcceptedAt: Map<string, number>`. That map is the entire mechanism — same `userId` string in, same cooldown entry out.

So the "auth" is really just a stable-per-browser label that gives the cooldown map something to key on. It provides no real identity guarantee: clearing `localStorage.rccm.userId`, or a raw client connecting with a hand-crafted `auth.userId`, gets a fresh cooldown at will. Visible in the running app (top-right of the header, hover for the full value) specifically so this is legible rather than hidden — it's the same value the cooldown is keyed on.

**Why not just use Socket.IO's own `client.id` as the identity, and skip the custom scheme?** It was considered and rejected for this specific job:

- `client.id` is **per-connection, not per-user** — it changes on every reconnect (page refresh, a network blip, a laptop waking from sleep). Keying the cooldown on it would let anyone bypass the cooldown by simply reconnecting.
- It's also **not shared across tabs** — each tab opens its own socket with its own `client.id`, so the same person could get one independent cooldown per tab open. The `localStorage`-based id avoids this because `localStorage` is shared across tabs of the same origin.

The `?? client.id` fallback in `handleConnection` above exists only for a client that doesn't send `auth.userId` at all (e.g. a raw test script) — a defensive default, not an intended identity source; in that degraded case the cooldown would correctly-but-unfortunately behave per-connection rather than per-user, which is exactly the failure mode described above.

A production build would replace all of this with a verified session or JWT, checked during the handshake, with the gateway reading `userId` from the verified token payload instead of trusting whatever the client declares. That id would still need to be stable across reconnects and shared appropriately across a user's tabs/devices for the cooldown to mean anything — the same two properties this prototype's `localStorage` id was chosen to have, just backed by a real credential instead of an unverified client claim.

## CORS

`GridGateway`'s `@WebSocketGateway({ cors: { origin: true } })` reflects any request origin. This is intentionally not read from an environment variable: gateway decorator options are evaluated when the file is first imported, which happens before `ConfigModule.forRoot()` has run and populated `process.env` from `.env` — so a naive `process.env.CORS_ORIGIN` read there would see `undefined` in local dev. A production build would lock this to a real allow-list, sourced from `process.env` directly (populated in time when a container/host injects it before Node starts, unlike a `.env` file loaded by `ConfigModule`).
