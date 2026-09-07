import { FRONTEND_ARCHITECTURE_MANIFEST } from "./fixtures/frontendArchitectureManifest.js";
import { captureConsoleErrors, expect, installFakeMaps, test } from "./fixtures/smoke.js";

const LIVE_ROOT_IDS = FRONTEND_ARCHITECTURE_MANIFEST.persistentExternalLiveRoots;

test("four React-external live roots keep their DOM identity across updates and page switches", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await expect(page.locator("#map")).toHaveAttribute("data-fake-google-map", "ready");
  await expect(page.locator("#nearby-sessions-count-status")).toContainText("7 場可加入");
  await page.evaluate((ids) => {
    globalThis.__fa04PersistentLiveRoots = Object.fromEntries(
      ids.map((id) => {
        const root = document.getElementById(id);
        if (!root) throw new Error(`Missing persistent live root: ${id}`);
        return [id, root];
      })
    );
  }, LIVE_ROOT_IDS);

  await page.evaluate(async () => {
    const { renderMapDataStatus, renderPlayerLayerToggle, renderToast } =
      await globalThis.__importAppModule("sessionViews");
    renderPlayerLayerToggle(document.getElementById("player-layer-toggle"), {
      message: "FA-04 球友狀態更新",
      on: true,
      status: "error",
    });
    renderMapDataStatus(document.getElementById("map-data-status"), {
      kind: "error",
      message: "FA-04 地圖狀態更新",
    });
    renderToast("FA-04 通知更新");
  });
  await expect(page.locator("#player-layer-status")).toContainText("FA-04 球友狀態更新");
  await expect(page.locator("#map-data-status")).toContainText("FA-04 地圖狀態更新");
  await expect(page.locator("#toast-root")).toContainText("FA-04 通知更新");

  await page.locator("#filter-sheet-open").click();
  await page.locator('#filters-sheet [data-filter="districts"][data-value="內湖區"]').click();
  await expect(page.locator("#nearby-sessions-count-status")).toContainText("2 場可加入");
  await page.locator("#filters-sheet [data-surface-close]").click();

  await page.getByTestId("me-tab").click();
  await expect(page.locator("#me-page")).toBeVisible();
  await page.getByTestId("map-tab").click();
  await expect(page.locator("#tab-map")).toBeVisible();

  const roots = await page.evaluate(
    (ids) =>
      ids.map((id) => {
        const original = globalThis.__fa04PersistentLiveRoots[id];
        const current = document.getElementById(id);
        return { connected: original.isConnected, id, sameNode: original === current };
      }),
    LIVE_ROOT_IDS
  );
  expect(roots).toEqual(
    LIVE_ROOT_IDS.map((id) => ({
      connected: true,
      id,
      sameNode: true,
    }))
  );
  expect(runtimeErrors).toEqual([]);
});
