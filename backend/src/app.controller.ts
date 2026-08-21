import { Controller, Get } from "@nestjs/common";

/**
 * The gateway is pure WebSocket -- no REST routes otherwise exist. This
 * one exists for infra checks (e.g. a load balancer or, in this repo,
 * Playwright's webServer readiness probe in e2e/playwright.config.ts,
 * which needs a 2xx response to consider the backend "up").
 */
@Controller()
export class AppController {
  @Get("health")
  health() {
    return { status: "ok" };
  }
}
