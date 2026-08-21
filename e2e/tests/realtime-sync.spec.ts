import { expect, test, type Page } from "@playwright/test";

const CRITICAL_STATUS = 2; // CellStatus.Critical, see frontend/src/constants/status.ts
const CRITICAL_RGB = [230, 74, 25]; // #e64a19

// The grid canvas's CSS size is width*cellSize (e.g. 4000x4000 at the
// default 4px/cell zoom) -- far bigger than the scrollable viewport that
// clips it, so its boundingBox() reflects the full unclipped element, not
// what's actually on screen. Clicking at that box's *center* (an earlier
// version of this test did) lands way outside the visible viewport and
// misses the canvas entirely. Click near its top-left corner instead,
// which is always inside the visible area at scroll position (0, 0).
const CLICK_OFFSET_PX = 40;
const DEFAULT_CELL_SIZE_PX = 4; // App.tsx's initial zoom -- keep in sync
const CLICKED_CELL = CLICK_OFFSET_PX / DEFAULT_CELL_SIZE_PX; // -> (10, 10)

async function readPixelAt(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ([x, y]) => {
      const canvas = document.querySelector(
        '[data-testid="grid-canvas"]',
      ) as HTMLCanvasElement;
      const ctx = canvas.getContext("2d")!;
      const data = ctx.getImageData(x, y, 1, 1).data;
      return [data[0], data[1], data[2]];
    },
    [x, y],
  );
}

test("a cell update made on one client is reflected live on another, without a manual refresh", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await pageA.goto("/");
  await pageB.goto("/");

  await expect(pageA.getByTestId("grid-canvas")).toBeVisible();
  await expect(pageB.getByTestId("grid-canvas")).toBeVisible();

  // Both clients should start from the same (empty) board.
  expect(await readPixelAt(pageB, CLICKED_CELL, CLICKED_CELL)).not.toEqual(
    CRITICAL_RGB,
  );

  // Click a cell -> modal opens -> pick a new status -> confirm.
  const canvas = pageA.getByTestId("grid-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("grid canvas has no bounding box");
  await pageA.mouse.click(box.x + CLICK_OFFSET_PX, box.y + CLICK_OFFSET_PX);

  await expect(pageA.getByTestId("cell-status-modal")).toBeVisible();
  await pageA.getByTestId(`status-option-${CRITICAL_STATUS}`).click();
  await expect(pageA.getByTestId("cell-modal-summary")).toContainText(
    "Critical",
  );
  await pageA.getByTestId("cell-modal-confirm").click();

  await expect(pageA.getByTestId("cell-status-modal")).not.toBeVisible();
  await expect(pageA.getByTestId("status-banner")).toContainText(
    "Update accepted",
  );

  // pageB never reloads: this only passes if the websocket broadcast
  // reached it and the canvas repainted the changed pixel.
  await expect
    .poll(() => readPixelAt(pageB, CLICKED_CELL, CLICKED_CELL), {
      timeout: 5_000,
    })
    .toEqual(CRITICAL_RGB);

  await contextA.close();
  await contextB.close();
});
