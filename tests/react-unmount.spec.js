import { expect, test } from "@playwright/test";
import { installAppModuleImporter } from "./fixtures/appRuntime.js";
import { installFakeMaps } from "./fixtures/fakeMaps.js";

const DETAIL_SESSION = Object.freeze({
  court: "測試球場",
  sessionId: 2020,
  startAt: "2026-08-21T01:00:00.000Z",
});

async function holdSessionDetailModule(page) {
  let markRequested;
  let releaseRequest;
  const requested = new Promise((resolve) => {
    markRequested = resolve;
  });
  const gate = new Promise((resolve) => {
    releaseRequest = resolve;
  });

  await page.route("**/src/sheets/SessionDetailSheet.tsx*", async (route) => {
    markRequested();
    await gate;
    await route.continue();
  });

  return {
    requested,
    async release() {
      const response = page.waitForResponse((candidate) =>
        new URL(candidate.url()).pathname.endsWith("/src/sheets/SessionDetailSheet.tsx")
      );
      releaseRequest();
      await response;
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    },
  };
}

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
    const { openCreateSessionSheet, openFilterSheet, preloadNonHomeViews } =
      await window.__importAppModule("sessionViews");
    await preloadNonHomeViews(["create", "filter"]);
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

test("Escape closes a loading detail shell and load resolution cannot late-mount it", async ({ page }) => {
  const moduleLoad = await holdSessionDetailModule(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async (session) => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    window.__detailCloseCalls = 0;
    openSessionSheet(session, {
      onClose: () => {
        window.__detailCloseCalls += 1;
      },
    });
  }, DETAIL_SESSION);
  await moduleLoad.requested;

  const sheet = page.locator("#session-sheet");
  await expect(sheet.locator("[data-lazy-surface-status]")).toContainText("正在載入");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__detailCloseCalls)).toBe(1);

  await moduleLoad.release();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator("[data-join-stage]")).toHaveCount(0);
});

test("detail commands queued during loading replay into the replacement once", async ({ page }) => {
  const moduleLoad = await holdSessionDetailModule(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async (session) => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    const detail = openSessionSheet(session, {
      action: { expectedAccepted: false, kind: "join", label: "申請加入" },
      showJoinPreview: true,
    });
    detail.setJoinPreview({
      participants: [{ nickname: "排隊球友", ntrp: 3.5, role: "host", sessionId: session.sessionId }],
      status: "ready",
    });
    detail.enterConfirming({ expectedAccepted: true });
  }, DETAIL_SESSION);
  await moduleLoad.requested;

  await moduleLoad.release();
  const sheet = page.locator("#session-sheet");
  await expect(sheet.locator('[data-join-stage="confirming"]')).toBeVisible();
  await expect(sheet.locator("[data-session-join-preview]")).toContainText("排隊球友");

  await page.keyboard.press("Escape");
  await expect(sheet.locator('[data-join-stage="idle"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("replacing a loading detail shell does not call onClose and a real close calls it once", async ({ page }) => {
  const moduleLoad = await holdSessionDetailModule(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async (session) => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    window.__detailCloseCalls = 0;
    openSessionSheet(session, {
      onClose: () => {
        window.__detailCloseCalls += 1;
      },
    });
  }, DETAIL_SESSION);
  await moduleLoad.requested;
  await expect.poll(() => page.evaluate(() => window.__detailCloseCalls)).toBe(0);

  await moduleLoad.release();
  const sheet = page.locator("#session-sheet");
  await expect(sheet.locator('[data-join-stage="idle"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__detailCloseCalls)).toBe(0);

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__detailCloseCalls)).toBe(1);
});

test("an anonymous session-card intent preloads detail without opening it", async ({ page }) => {
  const moduleLoad = await holdSessionDetailModule(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  await page.getByTestId("session-card").first().hover();
  await moduleLoad.requested;
  await expect(page.locator("#session-sheet")).toHaveCount(0);

  await moduleLoad.release();
  await expect(page.locator("#session-sheet")).toHaveCount(0);
});

test("an anonymous session-pin intent preloads detail without opening it", async ({ page }) => {
  const moduleLoad = await holdSessionDetailModule(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page
    .getByRole("button", { name: /地圖圖釘 球局 ·/ })
    .first()
    .focus();
  await moduleLoad.requested;
  await expect(page.locator("#session-sheet")).toHaveCount(0);

  await moduleLoad.release();
  await expect(page.locator("#session-sheet")).toHaveCount(0);
});
