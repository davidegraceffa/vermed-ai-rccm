# Regional Care Capacity Map

Vertical-slice prototype: a shared 1000×1000 grid of synthetic capacity
cells, updated live across connected clients over WebSockets, with a
per-user cooldown on accepted updates.

## Stack

- **backend/** — NestJS + Socket.io. In-memory grid store, per-user
  cooldown, and time-batched broadcast (no database required).
- **frontend/** — React + Vite + TypeScript, custom SCSS, canvas-rendered
  grid with pan/zoom and a minimap, `socket.io-client`.
- **e2e/** — Playwright, real-time sync and cooldown-rejection scenarios.
- **scripts/** — standalone verification tools (burst load test, snapshot
  payload/paint-cost measurement) — see below.
- Package manager: **pnpm** (workspace), pinned via `packageManager` in the
  root `package.json` — no separate global install needed if you have
  Corepack enabled (`corepack enable`).
- Node **>= 20** (`.nvmrc` pins 22).

## Run it

```bash
nvm use            # or ensure Node >= 20 is active
corepack enable     # if pnpm isn't already available
pnpm install

pnpm dev            # starts backend (:3001) and frontend (:5173) together
```

`pnpm dev` runs both with labeled, colored output in one terminal. To run
them separately instead (e.g. to watch one's logs in isolation):

```bash
pnpm dev:backend    # http://localhost:3001
pnpm dev:frontend   # http://localhost:5173
```

Open `http://localhost:5173` in two browser tabs. In one tab: click a cell
in the grid — a modal opens showing the cell's current status and a picker
for the new one, with a summary line ("Cell (x, y): Normal → Critical")
before you confirm. Click Confirm and watch the other tab update without a
refresh. Click another cell and confirm again immediately to see the
cooldown rejection (a snackbar at the bottom of the screen). Drag to pan
the board like a map, use the zoom control for cell size, and the minimap
(bottom-right of the grid) to see where your current view sits on the
whole board and jump elsewhere by clicking it.

Environment variables (see `backend/.env.example`, `frontend/.env.example`):
copy to `.env` in each package if you want to override defaults (cooldown
window, grid size, broadcast batch interval, socket URL). Not required to
run locally.

## Tests

```bash
cd e2e
pnpm exec playwright install chromium   # first time only
pnpm test
```

The Playwright config starts both dev servers itself (with a shortened
3s cooldown for the test run) — no need to have them running already.

## Verification scripts

Two standalone tools back specific claims made in `docs/ARCHITECTURE.md`
rather than just asserting them — both need the backend running
(`pnpm dev:backend` or `pnpm dev`) first.

```bash
pnpm run load-test         # burst-capacity check against the spec's ~333/s peak
pnpm run measure-snapshot  # measures the initial grid snapshot's wire size
```

`load-test` connects ~400 distinct simulated users and fires one update
each in a burst, reporting accepted count, achieved accepted/sec, and ack
latency (`CLIENTS` and `TARGET_URL` env vars are overridable).
`measure-snapshot` reports the byte size and connect-to-received time of
the full-board snapshot sent on connect.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — design decisions, what's real vs. simulated, production next steps.
- [`docs/AI_USE.md`](docs/AI_USE.md) — AI tools used and how, including specifics from this build.
- [`docs/PAST_WORK.md`](docs/PAST_WORK.md) — two prior projects that directly informed decisions made here.

## What works / what's simulated / what's next

See `docs/ARCHITECTURE.md` for the full breakdown, including the
reasoning behind the ~333/s peak interpretation, the broadcast-batching
design (with measured evidence), and why the current full-grid-on-connect
load is fine at this scale but would need to become viewport/tile-based
against an indexed store before the grid size or concurrency assumptions
here change. Short version:

- **Works now:** grid view with pan/zoom/minimap, live batched broadcast
  to all connected clients, per-user cooldown enforcement,
  bounds/status validation, a burst-capacity load test with measured
  results comfortably above the spec's peak target.
- **Simulated:** persistence (in-memory `Uint8Array`, lost on restart),
  auth (client-generated id, not verified).
- **Next:** durable store + Redis pub/sub for multi-instance broadcast for multi-instance production environment,
  real auth, viewport/tile-based initial load with a spatially indexed
  store.
