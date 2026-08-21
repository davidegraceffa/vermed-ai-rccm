import { expect, test, type Page } from "@playwright/test";

// COOLDOWN_MS is set to 3000 for the test run (see playwright.config.ts),
// independent of whatever backend/.env has configured for manual runs.

const CRITICAL_STATUS = 2; // CellStatus.Critical, see frontend/src/constants/status.ts

/** Click a cell, pick a (different) status in the modal that opens, confirm. */
async function requestCellUpdate(page: Page, x: number, y: number) {
  const box = await page.getByTestId("grid-canvas").boundingBox();
  if (!box) throw new Error("grid canvas has no bounding box");

  await page.mouse.click(box.x + x, box.y + y);
  await expect(page.getByTestId("cell-status-modal")).toBeVisible();
  await page.getByTestId(`status-option-${CRITICAL_STATUS}`).click();
  await page.getByTestId("cell-modal-confirm").click();
}

test("a second update within the cooldown window is rejected, and accepted again after it elapses", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("grid-canvas")).toBeVisible();

  await requestCellUpdate(page, 10, 10);
  await expect(page.getByTestId("status-banner")).toContainText(
    "Update accepted",
  );

  await requestCellUpdate(page, 20, 20);
  await expect(page.getByTestId("status-banner")).toContainText("cooldown");

  await page.waitForTimeout(3_500);

  await requestCellUpdate(page, 30, 30);
  await expect(page.getByTestId("status-banner")).toContainText(
    "Update accepted",
  );
});
