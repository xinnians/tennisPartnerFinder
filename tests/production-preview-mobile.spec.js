import { expect, test } from "@playwright/test";

import { installFakeMaps } from "./fixtures/fakeMaps.js";
import {
  captureProductionRuntimeErrors,
  expectProductionShell,
  installCrossEngineLatency,
  installLocalPreviewPlatformStubs,
  recordProductionPreviewMetrics,
} from "./fixtures/productionPreview.js";

test("390px slow-network production shell stays usable", async ({ browserName, context, page }, testInfo) => {
  const runtimeErrors = captureProductionRuntimeErrors(page);
  await installLocalPreviewPlatformStubs(page);
  await installFakeMaps(page);

  let networkMethod;
  if (browserName === "chromium") {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      connectionType: "cellular3g",
      downloadThroughput: (750 * 1024) / 8,
      latency: 150,
      offline: false,
      uploadThroughput: (250 * 1024) / 8,
    });
    networkMethod = "chromium-cdp-750kbps-150ms";
  } else {
    await installCrossEngineLatency(page, 150);
    networkMethod = "playwright-route-150ms-latency";
  }

  const startedAt = Date.now();
  await page.goto("/", { waitUntil: "commit" });
  await expectProductionShell(page);
  const shellVisibleMs = Date.now() - startedAt;
  await expect(page.locator("#map-data-status")).toBeHidden();
  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.getByRole("region", { name: "附近球局" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const scenarioReadyMs = Date.now() - startedAt;

  expect(page.viewportSize()).toEqual({ height: 844, width: 390 });
  expect(runtimeErrors).toEqual([]);
  await recordProductionPreviewMetrics(page, testInfo, `anonymous-mobile-${browserName}`, {
    networkMethod,
    scenarioReadyMs,
    shellVisibleMs,
  });
  await testInfo.attach(`anonymous-mobile-${browserName}.png`, {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
});
