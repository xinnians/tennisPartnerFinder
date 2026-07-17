import { expect, test } from "@playwright/test";
import { expectWithinViewport, installFakeMaps } from "./fixtures/fakeMaps.js";

const publicSurface = (page) => page.locator("#app");

async function installGeolocation(page, responses) {
  await page.addInitScript((nextResponses) => {
    let calls = 0;
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success, failure) {
          const response = nextResponses[Math.min(calls, nextResponses.length - 1)];
          calls += 1;
          if (response.error) failure(response.error);
          else success({ coords: response.coords });
        },
      },
    });
    window.__geolocationCallCount = () => calls;
  }, responses);
}

function captureConsoleErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("anonymous map discovery renders only safe SessionSummary fields", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await installGeolocation(page, [{ coords: { latitude: 25.03, longitude: 121.55 } }]);
  await page.goto("/");

  await expect(page.getByRole("region", { name: "台北市球局地圖" })).toBeVisible();
  await expect(page.locator("#map")).toHaveAttribute("data-fake-google-map", "ready");
  await expect(page.locator("#use-my-location")).toBeVisible();
  await expect(page.locator("#nearby-sessions-drawer")).toBeVisible();
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#nearby-sessions-summary")).toContainText("這個地圖範圍內");
  await expect(page.locator("#nearby-sessions-list")).toBeHidden();
  await expect(page.locator("#open-session")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__geolocationCallCount())).toBe(0);

  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "true");
  const firstCard = page.locator("[data-testid='session-card']").first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard).toContainText("示範");
  await expect(firstCard).toContainText("NTRP");

  const exposed = await publicSurface(page).innerText();
  expect(exposed).not.toMatch(/amber\.tw|hsu_tennis|facebook\.com|ptt\.cc|LINE ID/i);
  expect(exposed).not.toMatch(/profile[_ -]?id|真名|常打球場/i);
  const markerAttributes = await page.locator(".test-marker").evaluateAll((markers) =>
    markers.map((marker) => ({ title: marker.getAttribute("title"), aria: marker.getAttribute("aria-label") }))
  );
  expect(JSON.stringify(markerAttributes)).not.toMatch(/amber|line|profile|source|http/i);
  expect(runtimeErrors).toEqual([]);
});

test("drawer, filters, session sheet, and empty reset preserve the session-only flow", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  const firstCard = page.locator("[data-testid='session-card']").first();
  await firstCard.click();

  const sheet = page.locator("#session-sheet");
  await expect(sheet).toHaveAttribute("role", "dialog");
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  await expect(sheet.locator("[data-session-field='court']")).toBeVisible();
  await expect(sheet.locator("[data-session-field='time']")).toBeVisible();
  await expect(sheet.locator("[data-session-field='details']")).toBeVisible();
  await expect(sheet.locator("[data-session-field='host']")).toContainText("示範");
  await expect(sheet.locator("[data-session-field='notes']")).toContainText("本機示範");
  await expect(sheet.getByRole("button", { name: "申請加入" })).toBeVisible();
  const fieldOrder = await sheet.locator("[data-session-field], [data-session-action]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-session-field") ?? node.getAttribute("data-session-action"))
  );
  expect(fieldOrder).toEqual(["court", "time", "details", "host", "notes", "primary"]);
  await expectWithinViewport(page, sheet);

  await sheet.getByRole("button", { name: /關閉/ }).click();
  await page.locator("#date-filter").fill("2099-01-01");
  await expect(page.locator("#discovery-empty")).toBeVisible();
  await expect(page.locator("#discovery-empty")).toContainText("這個範圍暫時沒有可加入的球局");
  await expect(page.locator("#discovery-retry")).toBeVisible();
  await page.locator("#discovery-reset").click();
  await expect(page.locator("[data-testid='session-card']").first()).toBeVisible();

  await page.locator("[data-testid='session-card']").filter({ hasText: "已額滿" }).click();
  await expect(page.locator("#session-sheet [data-session-action='primary']")).toHaveText("已額滿");
  await expect(page.locator("#session-sheet [data-session-action='primary']")).toBeDisabled();
  await page.locator("#session-sheet").getByRole("button", { name: /關閉/ }).click();

  await page.getByRole("button", { name: /地圖圖釘 球場 青年公園網球場/ }).click();
  await expect(page.locator("#court-session-sheet")).toHaveAttribute("role", "dialog");
  await expect(page.locator("#court-session-sheet [data-testid='session-card']")).toHaveCount(1);
  expect(runtimeErrors).toEqual([]);
});

test("location is explicit, ephemeral, and recenters from a fresh coordinate", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await installGeolocation(page, [
    { coords: { latitude: 25.03, longitude: 121.55 } },
    { coords: { latitude: 25.05, longitude: 121.57 } },
  ]);
  await page.goto("/");

  await page.locator("#use-my-location").click();
  await expect.poll(() => page.evaluate(() => window.__geolocationCallCount())).toBe(1);
  await expect(page.locator("#nearby-sessions-summary")).toContainText("附近");
  const firstSnapshot = await page.evaluate(() => window.__fakeMapsSnapshot());
  expect(firstSnapshot.fitBoundsCalls).toHaveLength(1);
  expect(firstSnapshot.userMarkers).toEqual([{ title: "你" }]);
  expect(JSON.stringify(firstSnapshot.userMarkers)).not.toMatch(/25\.03|121\.55/);
  const stored = await page.evaluate(() => Object.values(sessionStorage).join(" "));
  expect(stored).not.toMatch(/25\.03|121\.55/);

  await page.locator("#use-my-location").click();
  await expect.poll(() => page.evaluate(() => window.__geolocationCallCount())).toBe(2);
  const secondSnapshot = await page.evaluate(() => window.__fakeMapsSnapshot());
  expect(secondSnapshot.fitBoundsCalls).toHaveLength(2);
  expect(secondSnapshot.userMarkers).toEqual([{ title: "你" }]);
  expect(runtimeErrors).toEqual([]);
});

test("location denial is non-repeating and Maps authentication fallback keeps discovery usable", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installGeolocation(page, [{ error: { code: 1, message: "denied" } }]);
  await page.route("https://maps.googleapis.com/maps/api/js**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "window.gm_authFailure?.();" })
  );
  await page.goto("/");

  await expect(page.locator("#map-data-status")).toContainText("地圖目前無法使用");
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("[data-testid='session-card']").first()).toBeVisible();
  await page.locator("#use-my-location").click();
  await expect(page.locator("#location-feedback")).toContainText("無法取得位置");
  await page.locator("#use-my-location").click();
  await expect.poll(() => page.evaluate(() => window.__geolocationCallCount())).toBe(1);
  expect(runtimeErrors).toEqual([]);
});
