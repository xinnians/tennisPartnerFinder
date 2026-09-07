import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { installFakeMaps } from "./fixtures/fakeMaps.js";
import { createProfile, setBrowserSession, signUpUser } from "./fixtures/localSupabase.js";
import {
  captureProductionRuntimeErrors,
  expectProductionShell,
  installLocalPreviewPlatformStubs,
  installPrivateDataChunkProbe,
  recordProductionPreviewMetrics,
} from "./fixtures/productionPreview.js";
import { createSessionTestContext } from "./fixtures/sessionFactory.js";

const AUTH_STORAGE_KEY = "tennis-partner-finder-auth";
const PKCE_VERIFIER_KEY = `${AUTH_STORAGE_KEY}-code-verifier`;

test.describe.configure({ mode: "serial" });

async function createCompletePreviewUser() {
  const context = createSessionTestContext({ suffix: `preview-${randomUUID()}` });
  const { client, session } = await signUpUser(context.guest.email);
  await createProfile(client, {
    courts: context.guest.courts,
    nickname: context.guest.nickname,
    ntrp: context.guest.ntrp,
    playTypes: context.guest.playTypes,
    slots: context.guest.slots,
  });
  return { session };
}

async function attachViewportScreenshot(page, testInfo, name) {
  await testInfo.attach(`${name}.png`, {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
}

test("anonymous first visit keeps the private production chunk unloaded", async ({ page }, testInfo) => {
  const runtimeErrors = captureProductionRuntimeErrors(page);
  const privateChunkProbe = installPrivateDataChunkProbe(page);
  await installLocalPreviewPlatformStubs(page);
  await installFakeMaps(page);

  const startedAt = Date.now();
  await page.goto("/", { waitUntil: "commit" });
  await expectProductionShell(page);
  const shellVisibleMs = Date.now() - startedAt;
  await expect(page.locator("#map-data-status")).toBeHidden();
  await expect(page.getByTestId("me-sign-in")).toHaveCount(1);
  await page.waitForLoadState("networkidle");
  const scenarioReadyMs = Date.now() - startedAt;
  const privateChunkRequests = await privateChunkProbe.settle();

  expect(privateChunkRequests).toEqual([]);
  expect(runtimeErrors).toEqual([]);
  await recordProductionPreviewMetrics(page, testInfo, "anonymous-desktop", {
    networkMethod: "native-local",
    scenarioReadyMs,
    shellVisibleMs,
  });
  await attachViewportScreenshot(page, testInfo, "anonymous-desktop");
});

test("authenticated first visit loads the private chunk through the same production marker probe", async ({
  page,
}, testInfo) => {
  const { session } = await createCompletePreviewUser();
  const runtimeErrors = captureProductionRuntimeErrors(page);
  const privateChunkProbe = installPrivateDataChunkProbe(page);
  await installLocalPreviewPlatformStubs(page);
  await installFakeMaps(page);
  await setBrowserSession(page, session);

  const profileResponse = page.waitForResponse(
    (response) => response.url().includes("/rest/v1/my_profile") && response.request().method() === "GET"
  );
  const startedAt = Date.now();
  await page.goto("/", { waitUntil: "commit" });
  await expectProductionShell(page);
  const shellVisibleMs = Date.now() - startedAt;
  await profileResponse;
  await page.getByTestId("me-tab").click();
  await expect(page.getByTestId("me-sign-out")).toBeVisible();
  await page.waitForLoadState("networkidle");
  const scenarioReadyMs = Date.now() - startedAt;
  const privateChunkRequests = await privateChunkProbe.settle();

  expect(privateChunkRequests.length).toBeGreaterThan(0);
  expect(new Set(privateChunkRequests).size).toBe(1);
  expect(runtimeErrors).toEqual([]);
  await recordProductionPreviewMetrics(page, testInfo, "authenticated-desktop", {
    networkMethod: "native-local",
    scenarioReadyMs,
    shellVisibleMs,
  });
  await attachViewportScreenshot(page, testInfo, "authenticated-desktop");
});

test("OAuth PKCE callback returns into the production app and verifies the local session", async ({
  page,
}, testInfo) => {
  const { session } = await createCompletePreviewUser();
  const runtimeErrors = captureProductionRuntimeErrors(page);
  const privateChunkProbe = installPrivateDataChunkProbe(page);
  await installLocalPreviewPlatformStubs(page);
  await installFakeMaps(page);
  await page.addInitScript(({ key, verifier }) => localStorage.setItem(key, JSON.stringify(verifier)), {
    key: PKCE_VERIFIER_KEY,
    verifier: "production-preview-verifier",
  });

  const exchanges = [];
  const refreshRequests = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() === "POST" &&
      url.pathname.endsWith("/auth/v1/token") &&
      url.searchParams.get("grant_type") === "refresh_token"
    ) {
      refreshRequests.push(request.url());
    }
  });
  await page.route("**/auth/v1/token?grant_type=pkce", async (route) => {
    const requestBody = route.request().postDataJSON();
    exchanges.push(requestBody);
    await route.fulfill({
      body: JSON.stringify(session),
      contentType: "application/json",
      status: 200,
    });
  });

  const startedAt = Date.now();
  await page.goto("/?code=production-preview-code", { waitUntil: "commit" });
  await expectProductionShell(page);
  const shellVisibleMs = Date.now() - startedAt;
  await expect.poll(() => new URL(page.url()).searchParams.has("code")).toBe(false);
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), PKCE_VERIFIER_KEY)).toBeNull();
  await page.getByTestId("me-tab").click();
  await expect(page.getByTestId("me-sign-out")).toBeVisible();
  await page.waitForLoadState("networkidle");
  const scenarioReadyMs = Date.now() - startedAt;
  const privateChunkRequests = await privateChunkProbe.settle();

  expect(exchanges).toEqual([{ auth_code: "production-preview-code", code_verifier: "production-preview-verifier" }]);
  expect(refreshRequests.length).toBeGreaterThan(0);
  expect(privateChunkRequests.length).toBeGreaterThan(0);
  expect(new Set(privateChunkRequests).size).toBe(1);
  expect(runtimeErrors).toEqual([]);
  await recordProductionPreviewMetrics(page, testInfo, "oauth-callback-desktop", {
    networkMethod: "native-local",
    scenarioReadyMs,
    shellVisibleMs,
  });
  await attachViewportScreenshot(page, testInfo, "oauth-callback-desktop");
});
