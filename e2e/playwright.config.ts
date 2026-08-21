import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const repoRoot = path.join(__dirname, "..");

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  fullyParallel: false,
  // All spec files share one backend process (and its in-memory grid +
  // cooldown state) via the single webServer below -- fullyParallel:false
  // only serializes tests *within* a file, so without this, separate spec
  // files would still run concurrently against that same shared state.
  // Currently the specs happen to use non-overlapping cells, so it hasn't
  // caused a visible collision, but that's incidental, not guaranteed.
  workers: 1,
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  // Cooldown is shortened to 3s for the test run so cooldown.spec.ts
  // doesn't need to wait out whatever value is set in backend/.env.
  webServer: [
    {
      command: "pnpm --filter backend start:dev",
      cwd: repoRoot,
      // /health, not just the origin: the backend is pure WebSocket
      // otherwise, so GET / is a 404, and Playwright's readiness probe
      // only accepts a 2xx as "the server is up".
      url: "http://localhost:3001/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { COOLDOWN_MS: "3000" },
    },
    {
      command: "pnpm --filter frontend dev -- --port 5173",
      cwd: repoRoot,
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
