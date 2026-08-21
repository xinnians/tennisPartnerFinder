import { expect, test } from "@playwright/test";
import { installAppModuleImporter } from "./fixtures/appRuntime.js";
import { installFakeMaps } from "./fixtures/fakeMaps.js";

test.beforeEach(async ({ page }) => {
  await installAppModuleImporter(page);
  await page.addInitScript(() => {
    globalThis.__surfaceContentUnmounts = [];
    globalThis.__tennisE2ETestHooks = {
      ...(globalThis.__tennisE2ETestHooks ?? {}),
      surfaceContentLifecycle: {
        onUnmount: (surfaceId) => globalThis.__surfaceContentUnmounts.push(surfaceId),
      },
    };
  });
});

test("closing and replacing sheets unmount each SurfaceHost portal exactly once", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openCreateSessionSheet, openFilterSheet } = await window.__importAppModule("sessionViews");
    openCreateSessionSheet();
    openFilterSheet();
  });

  await expect(page.locator("#session-create-modal")).toHaveCount(0);
  await expect(page.locator("#filters-sheet")).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.__surfaceContentUnmounts)).toEqual(["session-create-modal"]);

  await page.locator("#filters-sheet [data-surface-close]").click();
  await expect(page.locator("#filters-sheet")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => globalThis.__surfaceContentUnmounts))
    .toEqual(["session-create-modal", "filters-sheet"]);
  expect(pageErrors).toEqual([]);
});

test("a pending join result cannot render after its detail sheet unmounts", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    let releaseJoin;
    const pendingJoin = new Promise((resolve) => {
      releaseJoin = resolve;
    });
    globalThis.__releaseUnmountedJoin = () => releaseJoin({ joinSubmitted: true });
    openSessionSheet(
      { court: "測試球場", sessionId: 2020, startAt: "2026-08-21T01:00:00.000Z" },
      {
        action: { expectedAccepted: false, kind: "join", label: "申請加入" },
        initialStage: "confirming",
        onConfirmJoin: () => pendingJoin,
      }
    );
  });

  await page.getByTestId("join-confirm").click();
  await expect(page.locator('[data-join-stage="submitting"]')).toBeVisible();
  await page.locator("#session-sheet [data-surface-close]").click();
  await expect(page.locator("#session-sheet")).toHaveCount(0);
  await page.evaluate(async () => {
    globalThis.__releaseUnmountedJoin();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  await expect.poll(() => page.evaluate(() => globalThis.__surfaceContentUnmounts)).toEqual(["session-sheet"]);
  await expect(page.locator("#app-error-notice")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
