import { expect, test } from "@playwright/test";
import { expectWithinViewport, installFakeMaps, setFakeMapBounds } from "./fixtures/fakeMaps.js";

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

async function installControlledGeolocation(page) {
  await page.addInitScript(() => {
    const callbacks = [];
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition(success, failure) {
          callbacks.push({ failure, success });
        },
      },
    });
    window.__geolocationCallCount = () => callbacks.length;
    window.__resolveGeolocation = (index, latitude, longitude) => {
      callbacks[index]?.success({ coords: { latitude, longitude } });
    };
    window.__rejectGeolocation = (index) => callbacks[index]?.failure({ code: 1, message: "denied" });
  });
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
  await expect(page.locator(".chip-type").first()).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#band-options [data-band='all']")).toHaveAttribute("aria-pressed", "true");
  await page.locator(".chip-type[data-type='單打']").click();
  await expect(page.locator(".chip-type[data-type='單打']")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#level-chip").click();
  await page.locator("#band-options [data-band='mid']").click();
  await expect(page.locator("#band-options [data-band='mid']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#band-options [data-band='all']")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#filters-reset").click();
  await expect(page.locator(".chip-type[data-type='單打']")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#band-options [data-band='all']")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => window.__geolocationCallCount())).toBe(0);

  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#nearby-sessions-backdrop")).toBeVisible();
  await expect(page.locator(".app-header")).toHaveJSProperty("inert", true);
  await expect(page.locator("#map")).toHaveJSProperty("inert", true);
  await expect(page.locator("#nearby-sessions-toggle")).toHaveJSProperty("inert", true);
  await expect(page.locator("[data-nearby-close]")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#nearby-sessions-backdrop")).toBeHidden();
  await expect(page.locator(".app-header")).toHaveJSProperty("inert", false);
  await expect(page.locator("#nearby-sessions-toggle")).toHaveJSProperty("inert", false);
  await expect(page.locator("#nearby-sessions-toggle")).toBeFocused();

  await page.locator("#nearby-sessions-toggle").click();
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
  await firstCard.focus();
  await firstCard.press("Enter");

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

  await page.keyboard.press("Escape");
  await expect(firstCard).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#nearby-sessions-toggle")).toBeFocused();
  await page.locator("#date-filter").fill("2099-01-01");
  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#discovery-empty")).toBeVisible();
  await expect(page.locator("#discovery-empty")).toContainText("這個範圍暫時沒有可加入的球局");
  await expect(page.locator("#discovery-retry")).toBeVisible();
  await page.locator("#discovery-reset").click();
  await expect(page.locator("[data-testid='session-card']").first()).toBeVisible();

  await page.locator("[data-testid='session-card']").filter({ hasText: "已額滿" }).click();
  await expect(page.locator("#session-sheet [data-session-action='primary']")).toHaveText("已額滿");
  await expect(page.locator("#session-sheet [data-session-action='primary']")).toBeDisabled();
  await page.locator("#session-sheet").getByRole("button", { name: /關閉/ }).click();
  await page.keyboard.press("Escape");

  const basePin = page.getByRole("button", { name: /地圖圖釘 球場 青年公園網球場/ });
  await basePin.focus();
  await basePin.press("Enter");
  await expect(page.locator("#court-session-sheet")).toHaveAttribute("role", "dialog");
  await expect(page.locator("#court-session-sheet [data-testid='session-card']")).toHaveCount(1);
  const courtCard = page.locator("#court-session-sheet [data-testid='session-card']");
  await courtCard.focus();
  await courtCard.press("Enter");
  await expect(page.locator("#session-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(basePin).toBeFocused();
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
  expect(firstSnapshot.fitBoundsCalls[0].latitudeSpan).toBeGreaterThan(0.08);
  expect(firstSnapshot.fitBoundsCalls[0].latitudeSpan).toBeLessThan(0.1);
  expect(firstSnapshot.fitBoundsCalls[0].longitudeSpan).toBeGreaterThan(0.09);
  expect(firstSnapshot.fitBoundsCalls[0].longitudeSpan).toBeLessThan(0.11);
  expect(firstSnapshot.userMarkers).toEqual([{ title: "你" }]);
  expect(firstSnapshot.userMarkerCreates).toBe(1);
  expect(firstSnapshot.userMarkerUpdates).toBe(0);
  expect(JSON.stringify(firstSnapshot.userMarkers)).not.toMatch(/25\.03|121\.55/);
  const stored = await page.evaluate(() => Object.values(sessionStorage).join(" "));
  expect(stored).not.toMatch(/25\.03|121\.55/);

  await page.locator("#use-my-location").click();
  await expect.poll(() => page.evaluate(() => window.__geolocationCallCount())).toBe(2);
  const secondSnapshot = await page.evaluate(() => window.__fakeMapsSnapshot());
  expect(secondSnapshot.fitBoundsCalls).toHaveLength(2);
  expect(secondSnapshot.fitBoundsCalls[1].changedFromPrevious).toBe(true);
  expect(secondSnapshot.userMarkers).toEqual([{ title: "你" }]);
  expect(secondSnapshot.userMarkerCreates).toBe(1);
  expect(secondSnapshot.userMarkerUpdates).toBe(1);
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
  await page.keyboard.press("Escape");
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "false");
  await page.locator("#use-my-location").click();
  await expect(page.locator("#location-feedback")).toContainText("無法取得位置");
  await page.locator("#use-my-location").click();
  await expect.poll(() => page.evaluate(() => window.__geolocationCallCount())).toBe(1);
  expect(runtimeErrors).toEqual([]);
});

test("newest geolocation callback wins without exposing a coordinate", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await installControlledGeolocation(page);
  await page.goto("/");

  await page.locator("#use-my-location").click();
  await page.locator("#use-my-location").click();
  await page.locator("#use-my-location").click();
  await expect.poll(() => page.evaluate(() => window.__geolocationCallCount())).toBe(3);
  await page.evaluate(() => {
    window.__resolveGeolocation(2, 25.06, 121.58);
    window.__rejectGeolocation(0);
    window.__resolveGeolocation(1, 25.03, 121.55);
  });
  await expect.poll(async () => (await page.evaluate(() => window.__fakeMapsSnapshot())).fitBoundsCalls.length).toBe(1);
  const snapshot = await page.evaluate(() => window.__fakeMapsSnapshot());
  expect(snapshot.userMarkerCreates).toBe(1);
  expect(snapshot.userMarkerUpdates).toBe(0);
  expect(JSON.stringify(snapshot)).not.toMatch(/25\.06|121\.58|25\.03|121\.55/);
  await page.locator("#use-my-location").click();
  await expect.poll(() => page.evaluate(() => window.__geolocationCallCount())).toBe(4);
  const publicHtml = await publicSurface(page).innerHTML();
  expect(publicHtml).not.toMatch(/25\.06|121\.58|25\.03|121\.55/);
  expect(runtimeErrors).toEqual([]);
});

test("map idle refreshes the current bounds and session pins remain keyboard-compatible", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await expect.poll(async () => {
    const snapshot = await page.evaluate(() => window.__fakeMapsSnapshot());
    return snapshot.visibleMarkerOptions.length;
  }).toBeGreaterThan(0);
  const markerOptions = await page.evaluate(() => window.__fakeMapsSnapshot().visibleMarkerOptions);
  expect(markerOptions.every((marker) => marker.optimized === false)).toBe(true);

  const sessionPin = page.getByRole("button", { name: /地圖圖釘 球局 · 台北網球中心/ });
  await sessionPin.focus();
  await sessionPin.press("Enter");
  await expect(page.locator("#session-sheet")).toBeVisible();
  await expect(page.locator("#tab-map")).toHaveJSProperty("inert", true);
  await page.keyboard.press("Escape");
  await expect(sessionPin).toBeFocused();

  await setFakeMapBounds(page, { south: 25.14, west: 121.6, north: 25.16, east: 121.62 });
  await page.waitForTimeout(310);
  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#discovery-empty")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("a discovery rerender cannot let an underlying drawer overtake a sheet modal", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  const firstCard = page.locator("[data-testid='session-card']").first();
  await firstCard.focus();
  await firstCard.press("Enter");
  await expect(page.locator("#session-sheet")).toBeVisible();
  await expect(page.locator("#sheet-root")).toHaveJSProperty("inert", false);

  await setFakeMapBounds(page, { south: 25.14, west: 121.6, north: 25.16, east: 121.62 });
  await page.waitForTimeout(310);
  await expect(page.locator("#session-sheet")).toBeVisible();
  await expect(page.locator("#sheet-root")).toHaveJSProperty("inert", false);
  await expect(page.locator("#tab-map")).toHaveJSProperty("inert", true);
  await page.keyboard.press("Escape");
  await expect(page.locator("#nearby-sessions-list")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("nested login modal restores focus and announces a failed provider start", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const sessionPin = page.getByRole("button", { name: /地圖圖釘 球局 · 台北網球中心/ });
  await sessionPin.focus();
  await sessionPin.press("Enter");
  const primary = page.locator("#session-sheet [data-session-action='primary']");
  await primary.click();
  await expect(page.locator("#login-dialog")).toBeVisible();
  await expect(page.locator("#sheet-root")).toHaveJSProperty("inert", true);
  const message = page.locator("[data-login-message]");
  await expect(message).toHaveAttribute("role", "status");
  await expect(message).toHaveAttribute("aria-live", "polite");
  await page.locator("[data-provider='google']").click();
  await expect(message).toContainText("登入啟動失敗");
  await page.keyboard.press("Escape");
  await expect(primary).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sessionPin).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});
