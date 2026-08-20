import { expect, test } from "@playwright/test";
import { installAppModuleImporter, installAppTestHooks } from "./fixtures/appRuntime.js";
import { installFakeMaps } from "./fixtures/fakeMaps.js";

test.beforeEach(async ({ page }) => installAppModuleImporter(page));

test("a caught React sheet render failure shows a closable fallback without breaking the map", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installAppTestHooks(page, { reactRenderError: { surface: "create-session-sheet" } });
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await window.__importAppModule("sessionViews");
    openCreateSessionSheet();
  });

  const fallback = page.getByTestId("app-error-fallback");
  await expect(fallback).toBeVisible();
  await expect(fallback).toContainText("這個畫面暫時無法顯示");
  await fallback.getByRole("button", { name: "關閉" }).click();
  await expect(page.locator("#session-create-modal")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "台北市球局地圖" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("global errors and unhandled rejections reuse one detail-free dismissible notice", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(() => {
    const event = new ErrorEvent("error", {
      error: new TypeError("nickname=私密球友 GPS=25.1,121.5"),
      message: "LINE=secret@example.test",
    });
    window.dispatchEvent(event);
  });
  const notice = page.locator("#app-error-notice");
  await expect(notice).toBeVisible();
  await expect(notice).toHaveText("剛才的操作沒有完整完成，請再試一次。關閉");
  await expect(notice).not.toContainText(/私密球友|25\.1|121\.5|LINE|secret|example/i);

  await page.evaluate(() => {
    const event = new Event("unhandledrejection");
    Object.defineProperty(event, "reason", { value: new Error("roster private detail") });
    window.dispatchEvent(event);
  });
  await expect(page.locator("#app-error-notice")).toHaveCount(1);
  await notice.getByRole("button", { name: "關閉" }).click();
  await expect(notice).toHaveCount(0);
});
