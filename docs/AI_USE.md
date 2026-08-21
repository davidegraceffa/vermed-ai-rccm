# AI Use Note

## Tools

- **Claude Code** (Claude Sonnet 5), CLI-based agentic coding assistant — used for the full build: spec analysis, scaffolding, implementation, debugging, load/measurement tooling, and this documentation.
- **Chrome browser automation** (Claude Code's built-in browser tooling) — used throughout for live, visual verification of every UI change in a real browser, not just build/typecheck success.

## Approach

The build followed six stages. It wasn't a single prompt that generated a repo — each stage was a conversation, with the AI executing and verifying, and the developer making the calls that needed judgment: what the core features actually were, which stack to build them with, and how far to take any given trade-off.

### 1. Spec analysis

The case study's PDF (Product Engineer Case Study — Regional Care Capacity Map) was read and extracted by the AI first: the scenario, the product's functional requirements (1000×1000 grid, ~333 accepted cell updates/sec at peak, one accepted update per user per cooldown, a live-refreshed board), the working constraints, and the four required submission deliverables.

**1.1 Breakdown into activities.** From that extraction, the AI proposed the shape of the work as a small number of concrete, separable pieces: real-time state sync between clients, per-user rate limiting (the cooldown), a persistence layer that wouldn't require any reviewer setup, and a way to actually demonstrate the ~333/s peak claim rather than assert it.

**1.2 Core features and stack, developer-driven.** The developer picked the stack and integration shape explicitly: a React frontend and a NestJS backend as two separate apps, Socket.IO for real-time updates, a throttling mechanism for the cooldown, an in-memory store in place of a real database (so the exercise needs no reviewer setup), and Playwright for testing. The AI's role here was to push back with a concrete technical distinction where the plan needed one — e.g. that a generic request-rate limiter (`@nestjs/throttler`) enforces a different guarantee than "one accepted update per cooldown window," which needed a purpose-built per-user timestamp check (`CooldownService`) instead of the off-the-shelf throttler.

### 2. Scaffolding

The AI scaffolded the repository to the agreed shape: a pnpm workspace with the two apps as separate packages (`backend/`, `frontend/`), each with its own toolchain (NestJS CLI, Vite), plus `e2e/` for Playwright and, later, `scripts/` for standalone verification tooling. This stage also produced the first working vertical slice — grid gateway, in-memory store, cooldown service, and a React app that could render and update it — verified by actually running it, not just by a clean build.

### 3. E2E tests and verification scripts, emphasizing the project's critical features

Two things needed proving, not just building, and they needed different tools for it:

- **Massive initial load** (the full 1,000,000-cell snapshot pushed to every connecting client) and **update batching** (accepted updates broadcast in batches rather than one Socket.IO message per update) are both about behavior at a scale a browser-driven test can't easily simulate — you can't practically open hundreds of real browser tabs in Playwright. These were verified with standalone Node scripts talking to the backend directly over `socket.io-client`: `scripts/load-test.mjs` (connects ~400 distinct simulated users and fires one update each in a burst, measuring accepted throughput and ack latency) and `scripts/measure-snapshot.mjs` (measures the snapshot payload's byte size and delivery time). A separate check confirmed the batching itself: 300 accepted updates from 300 simulated clients arrived at an observer as 5 broadcast events, not 300.
- **User-facing interaction correctness** — a cell update made in one browser tab appearing live in another without a refresh, and a second update within the cooldown window being rejected — was covered with Playwright (`e2e/tests/realtime-sync.spec.ts`, `e2e/tests/cooldown.spec.ts`), driving two real browser contexts against the running app.

This split was deliberate, not incidental: browser-level e2e tests are the right tool for "does the interaction behave correctly," and direct socket-level scripts are the right tool for "does it hold up at the scale the spec actually asks about" — conflating the two would have meant either an unrealistic Playwright load test or a load test that never touched the real UI.

### 4. UI component development via prompts

Once the vertical slice worked, the UI was built and refined through targeted prompts, one interaction or fix at a time — the grid render, the click-to-modal update flow with an old-status/new-status summary, the minimap with its "you are here" indicator, pan/zoom, hover tooltips, the light theme, layout alignment. Each change was verified visually in a real browser before moving to the next, which is what caught the build's real bugs: a `Path2D` fill that silently rasterized as a blank canvas in some runs, a viewport-tracking hook that would have never attached its scroll listener, and — during a later review pass — an e2e test clicking outside the actual visible viewport because it measured the wrong element's bounding box.

### 5. Documentation alongside development

`docs/ARCHITECTURE.md` was written incrementally, as each decision was made, not compiled afterward — including the reasoning for choices that were *not* taken (e.g. why Socket.IO's own `client.id` was rejected as a user-identity source for the cooldown; why a second canvas for grid lines was replaced with a CSS pattern once its memory cost at high zoom became clear). The intent was for the document to capture *why*, at the moment the trade-off was actually weighed, rather than reconstructing it later from the code.

### 6. Commit message drafting

Once each package's work was reasonably complete (backend, frontend, e2e, scripts), the AI drafted a detailed, conventional commit message summarizing it by scanning the actual code written — one per package, covering not just what changed but why (e.g. why broadcast batching exists, why the color and grid-line layers are split, why the e2e suite's readiness probe needed a `/health` route) — without running any git command itself. Drafting stayed separate from execution: the same boundary applied elsewhere in this build (scope and infrastructure decisions surfaced as choices rather than acted on unilaterally) applies here too — the developer decides when history actually gets created and in what shape (one commit per package, or split further), not the AI.

## Looking ahead: this product's future SDLC

If this moved past a prototype, the same tools would extend the same way rather than needing a different workflow: test maintenance as part of every UI change rather than a separate pass (as in stage 4 above), the verification scripts from stage 3 kept as living tools re-run as the system changes rather than one-off proof, and architecture documentation kept current at decision time rather than left to go stale. None of it replaces review or testing discipline — it shortens the loop between making a change and actually knowing whether it's correct, which is what caught this build's real bugs in the first place.
