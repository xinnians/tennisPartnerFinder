import { expect, test } from "@playwright/test";

import { DISCOVERY_WINDOW_DAYS, MAP_IDLE_DEBOUNCE_MS } from "../src/config.js";
import { installFakeMaps, setFakeMapBounds, setFakeMapBoundsBurst } from "./fixtures/fakeMaps.js";

const isLocalHarness = process.env.TENNIS_TEST_HARNESS_MODE === "local";

function captureConsoleErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function delayMockDiscovery(page, milliseconds) {
  await page.route("**/src/dataApi.js", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const marker = "  async function loadSessionDiscovery(input = {}) {";
    if (!source.includes(marker)) throw new Error("Could not install delayed discovery fixture");
    await route.fulfill({
      response,
      body: source.replace(marker, `${marker}\n    await new Promise((resolve) => setTimeout(resolve, ${milliseconds}));`),
    });
  });
}

async function failFirstMockDiscovery(page) {
  await page.route("**/src/dataApi.js", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const marker = "  async function loadSessionDiscovery(input = {}) {";
    if (!source.includes(marker)) throw new Error("Could not install failed discovery fixture");
    await route.fulfill({
      response,
      body: source.replace(
        marker,
        `${marker}\n    if (!globalThis.__mockDiscoveryFailedOnce) {\n      globalThis.__mockDiscoveryFailedOnce = true;\n      throw new Error("forced discovery failure");\n    }`
      ),
    });
  });
}

test("slow discovery keeps the map shell, base courts, and status usable before session rows arrive", async ({ page }) => {
  test.skip(isLocalHarness, "The delayed discovery shell is a deterministic mock-harness check.");
  const runtimeErrors = captureConsoleErrors(page);
  await delayMockDiscovery(page, 2_500);
  await installFakeMaps(page);

  const startedAt = Date.now();
  await page.goto("/", { waitUntil: "commit" });

  const map = page.getByRole("region", { name: "台北市球局地圖" });
  const drawerToggle = page.locator("#nearby-sessions-toggle");
  const loadingStatus = page.locator("#map-data-status");
  const baseCourtPin = page.getByRole("button", { name: /地圖圖釘 球場 青年公園網球場/ });

  await expect(map).toBeVisible();
  await expect(page.locator("#map")).toHaveAttribute("data-fake-google-map", "ready");
  await expect(drawerToggle).toHaveAttribute("aria-expanded", "false");
  await expect(drawerToggle).toHaveAttribute("aria-controls", "nearby-sessions-list");
  await expect(loadingStatus).toHaveAttribute("role", "status");
  await expect(loadingStatus).toHaveAttribute("aria-live", "polite");
  await expect(loadingStatus).toContainText("正在載入球局資料");
  await drawerToggle.click();
  const loadingDrawer = page.locator("#nearby-sessions-list");
  await expect(loadingDrawer).toHaveAttribute("role", "dialog");
  await expect(loadingDrawer.getByRole("status")).toContainText("正在載入球局資料");
  await expect(loadingDrawer.locator("#discovery-empty")).toHaveCount(0);
  await expect(loadingDrawer.locator("[data-nearby-close]")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawerToggle).toBeFocused();
  await expect(baseCourtPin).toBeVisible();
  await baseCourtPin.click();
  await expect(page.locator("#court-session-sheet")).toBeVisible();
  expect(Date.now() - startedAt).toBeLessThan(1_000);

  await page.keyboard.press("Escape");
  await expect(baseCourtPin).toBeFocused();
  await expect(loadingStatus).toBeHidden({ timeout: 3_500 });

  await drawerToggle.click();
  await expect(page.locator("[data-testid='session-card']").first()).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("configured discovery uses one debounced, bounded viewport request", async ({ page }) => {
  test.skip(!isLocalHarness, "REST query inspection needs the configured local Supabase harness.");
  const runtimeErrors = captureConsoleErrors(page);
  const discoveryRequests = [];
  page.on("request", (request) => {
    if (request.method() === "GET" && request.url().includes("/rest/v1/session_discovery")) {
      discoveryRequests.push(request);
    }
  });
  await installFakeMaps(page);
  const initialDiscovery = page.waitForResponse(
    (response) => response.request().method() === "GET" && response.url().includes("/rest/v1/session_discovery")
  );
  await page.goto("/");
  await initialDiscovery;
  await expect(page.locator("#map-data-status")).toBeHidden();
  await expect(page.locator("#map")).toHaveAttribute("data-fake-google-map", "ready");

  discoveryRequests.length = 0;
  const finalBounds = { south: 25.02, west: 121.51, north: 25.08, east: 121.59 };
  await setFakeMapBoundsBurst(page, [
    { south: 25.0, west: 121.48, north: 25.06, east: 121.56 },
    { south: 25.01, west: 121.5, north: 25.07, east: 121.58 },
    finalBounds,
  ]);

  await expect.poll(() => discoveryRequests.length).toBe(1);
  await page.waitForTimeout(MAP_IDLE_DEBOUNCE_MS + 100);
  expect(discoveryRequests).toHaveLength(1);

  const requestUrl = new URL(discoveryRequests[0].url());
  const all = (column) => requestUrl.searchParams.getAll(column);
  expect(all("court_lat")).toEqual([`gte.${finalBounds.south}`, `lte.${finalBounds.north}`]);
  expect(all("court_lng")).toEqual([`gte.${finalBounds.west}`, `lte.${finalBounds.east}`]);

  const startBounds = all("start_at");
  const lower = startBounds.find((value) => value.startsWith("gt."));
  const upper = startBounds.find((value) => value.startsWith("lt."));
  expect(lower).toBeTruthy();
  expect(upper).toBeTruthy();
  const lowerTime = new Date(lower.slice(3)).getTime();
  const upperTime = new Date(upper.slice(3)).getTime();
  const nowStartWindowMs = 2 * 60 * 60 * 1_000;
  expect(lowerTime).toBeGreaterThan(Date.now() - nowStartWindowMs - 20_000);
  expect(lowerTime).toBeLessThan(Date.now() - nowStartWindowMs + 5_000);
  expect(upperTime - lowerTime).toBe(DISCOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1_000 + nowStartWindowMs);
  expect(runtimeErrors).toEqual([]);
});

test("an in-context drawer retry replaces the semantic error state with results", async ({ page }) => {
  test.skip(isLocalHarness, "The deterministic transient failure is covered in the mock harness.");
  const runtimeErrors = captureConsoleErrors(page);
  await failFirstMockDiscovery(page);
  await installFakeMaps(page);
  await page.goto("/");

  const mapStatus = page.locator("#map-data-status");
  await expect(mapStatus).toHaveAttribute("role", "status");
  await expect(mapStatus).toContainText("球局資料暫時無法載入");
  await page.locator("#nearby-sessions-toggle").click();
  const drawer = page.getByRole("dialog", { name: "附近球局" });
  await expect(drawer.getByRole("alert")).toContainText("球局資料暫時無法載入");
  const retry = drawer.locator("#drawer-map-retry");
  await retry.click();
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("[data-testid='session-card']").first()).toBeVisible();
  await expect(mapStatus).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

test("keyboard dialogs trap focus and return it to the trigger", async ({ page }) => {
  test.skip(isLocalHarness, "The reusable dialog primitives are exercised in the mock harness.");
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const mapTab = page.getByTestId("map-tab");
  const mySessionsTab = page.getByTestId("my-sessions-tab");
  await expect(mapTab).toHaveAttribute("aria-current", "page");
  await expect(mapTab).toHaveAttribute("aria-controls", "tab-map");
  await expect(mySessionsTab).toHaveAttribute("aria-controls", "my-sessions-page");
  await mySessionsTab.click();
  await expect(mySessionsTab).toHaveAttribute("aria-current", "page");
  await expect(mapTab).not.toHaveAttribute("aria-current");
  await mapTab.click();
  await expect(mapTab).toHaveAttribute("aria-current", "page");

  const drawerToggle = page.locator("#nearby-sessions-toggle");
  await drawerToggle.focus();
  await drawerToggle.press("Enter");
  const drawer = page.getByRole("dialog", { name: "附近球局" });
  const drawerClose = drawer.getByRole("button", { name: "關閉附近球局" });
  const lastDrawerCard = drawer.locator("[data-testid='session-card']").last();
  await expect(drawerClose).toBeFocused();
  await drawerClose.press("Shift+Tab");
  await expect(lastDrawerCard).toBeFocused();
  await lastDrawerCard.press("Tab");
  await expect(drawerClose).toBeFocused();

  const sessionCard = drawer.locator("[data-testid='session-card']").first();
  await sessionCard.focus();
  await sessionCard.press("Enter");
  const detail = page.getByRole("dialog", { name: "球局詳情" });
  const detailClose = detail.getByRole("button", { name: "關閉球局詳情" });
  const detailPrimary = detail.locator("[data-session-action='primary']");
  await expect(detailClose).toBeFocused();
  await detailClose.press("Shift+Tab");
  await expect(detailPrimary).toBeFocused();
  await detailPrimary.press("Tab");
  await expect(detailClose).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sessionCard).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawerToggle).toBeFocused();

  const createTrigger = page.getByTestId("create-session-tab");
  await createTrigger.focus();
  await page.evaluate(async () => {
    const { openJoinSessionConfirmation } = await import("/src/sessionViews.js");
    openJoinSessionConfirmation({
      court: "示範球場",
      courtDistrict: "大安區",
      hostNickname: "示範松果",
      hostNtrp: 3.5,
      hostProfileComplete: true,
      notes: "鍵盤測試",
      ntrpMax: 4,
      ntrpMin: 3,
      playType: "單打",
      slotsRemaining: 1,
      startAt: "2099-07-18T01:30:00.000Z",
    });
  });
  const confirmation = page.getByRole("dialog", { name: "確認申請加入" });
  const confirmationClose = confirmation.getByRole("button", { name: "關閉確認" });
  const confirmationSubmit = confirmation.getByTestId("join-session");
  await expect(confirmationClose).toBeFocused();
  await confirmationClose.press("Shift+Tab");
  await expect(confirmationSubmit).toBeFocused();
  await confirmationSubmit.press("Tab");
  await expect(confirmationClose).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(createTrigger).toBeFocused();

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await import("/src/sessionViews.js");
    openCreateSessionSheet({ courts: [{ city: "台北市", district: "大安區", id: 8, name: "示範球場" }] });
  });
  const createSheet = page.getByRole("dialog", { name: "開球局" });
  const createClose = createSheet.getByRole("button", { name: "關閉開球局" });
  const createSubmit = createSheet.getByTestId("session-submit");
  await expect(createClose).toBeFocused();
  await createClose.press("Shift+Tab");
  await expect(createSubmit).toBeFocused();
  await createSubmit.press("Tab");
  await expect(createClose).toBeFocused();

  // B-6 摺疊：summary 本身是 tab stop；details 收合時內部欄位（NTRP／費用說明／備註）不進 tab 序列。
  const createForm = createSheet.getByTestId("session-form");
  const instantJoinMode = createForm.locator("input[name='joinMode'][value='instant']");
  const advancedSummary = createForm.locator(".form-optional summary");
  await instantJoinMode.focus();
  await instantJoinMode.press("Tab");
  await expect(advancedSummary).toBeFocused();
  await advancedSummary.press("Tab");
  await expect(createSubmit).toBeFocused();
  await createSubmit.press("Shift+Tab");
  await expect(advancedSummary).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(createTrigger).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("a stale drawer card hands keyboard focus to the empty-state retry", async ({ page }) => {
  test.skip(isLocalHarness, "The deterministic viewport transition is covered in the mock harness.");
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  const card = page.locator("[data-testid='session-card']").first();
  await card.focus();
  await setFakeMapBounds(page, { south: 25.14, west: 121.6, north: 25.16, east: 121.62 });
  await expect(page.locator("#discovery-empty")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)).toBe("discovery-expand");
  expect(runtimeErrors).toEqual([]);
});

test("a delayed discovery refresh keeps drawer focus on a durable target", async ({ page }) => {
  test.skip(isLocalHarness, "The delayed viewport refresh is a deterministic mock-harness check.");
  const runtimeErrors = captureConsoleErrors(page);
  await delayMockDiscovery(page, 600);
  await installFakeMaps(page);
  await page.goto("/");

  const mapStatus = page.locator("#map-data-status");
  const drawer = page.getByRole("dialog", { name: "附近球局" });
  await expect(mapStatus).toBeHidden();
  await page.locator("#nearby-sessions-toggle").click();
  const card = drawer.locator("[data-testid='session-card']").first();
  await card.focus();

  await setFakeMapBounds(page, { south: 24.9, west: 121.4, north: 25.2, east: 121.7 });
  await expect(drawer.getByRole("status")).toContainText("正在載入球局資料");
  await expect(drawer.locator("[data-nearby-close]")).toBeFocused();
  await expect(card).toBeVisible();
  await expect(card).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("drawer redraws preserve a focused collapsed toggle and empty-state action", async ({ page }) => {
  test.skip(isLocalHarness, "The deterministic redraw behavior is covered in the mock harness.");
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const toggle = page.locator("#nearby-sessions-toggle");
  await toggle.focus();
  await page.evaluate(() => {
    document.querySelector("#date-filter")?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(toggle).toBeFocused();

  await page.locator("#date-filter").fill("2099-01-01");
  await toggle.click();
  const first = page.locator("#discovery-first");
  await expect(first).toBeVisible();
  await first.focus();
  await page.evaluate(() => {
    document.querySelector("#date-filter")?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)).toBe("discovery-first");

  // 對稱案例：批 B-4 fix round 1 補了 DRAWER_ACTION_IDS 收 "discovery-subscribe"，這裡鎖住
  // 回歸——沒收的話，這顆按鈕上的鍵盤焦點在抽屜重繪時會被 drawerRecoveryTarget() fallback
  // 誤導去 #discovery-expand，而不是留在原按鈕上。
  const subscribe = page.locator("#discovery-subscribe");
  await expect(subscribe).toBeVisible();
  await subscribe.focus();
  await page.evaluate(() => {
    document.querySelector("#date-filter")?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName))
    .toBe("discovery-subscribe");
  expect(runtimeErrors).toEqual([]);
});

test("an empty-state reset keeps a keyboard user in the drawer with a next card", async ({ page }) => {
  test.skip(isLocalHarness, "The deterministic filter transition is covered in the mock harness.");
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#date-filter").fill("2099-01-01");
  await page.locator("#nearby-sessions-toggle").click();
  const reset = page.locator("#discovery-reset");
  await expect(reset).toBeVisible();
  await reset.focus();
  await reset.press("Enter");
  const nextCard = page.locator("[data-testid='session-card']").first();
  await expect(nextCard).toBeVisible();
  await expect(nextCard).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("a stale opening focus callback cannot steal focus after an immediate drawer redraw", async ({ page }) => {
  test.skip(isLocalHarness, "The deterministic focus race is covered in the mock harness.");
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(() => {
    const date = document.querySelector("#date-filter");
    date.value = "2099-01-01";
    date.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#nearby-sessions-toggle")?.click();
    const reset = document.querySelector("#discovery-reset");
    reset?.focus();
    reset?.click();
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const nextCard = page.locator("[data-testid='session-card']").first();
  await expect(nextCard).toBeVisible();
  await expect(nextCard).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("a 667px tall viewport never leaves the document scrollable past its own height", async ({ page }) => {
  // 批 B-8(B7):.map-page 在窄視窗曾固定 min-height:620px,矮於 620px 的視窗(如 iPhone SE
  // 390×667)高度不夠時仍撐出這個底線,把 document 撐高到超出可視區,產生垂直捲動。
  // min-height 改成 min(620px, calc(100dvh - 60px)) 後,高度應貼齊視窗而不外溢。
  test.skip(isLocalHarness, "This is a deterministic layout check independent of the data source.");
  const runtimeErrors = captureConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 667 });
  await installFakeMaps(page);
  await page.goto("/");
  await expect(page.getByRole("region", { name: "台北市球局地圖" })).toBeVisible();

  const overflow = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.innerHeight + 1);
  expect(runtimeErrors).toEqual([]);
});

// 批 C1-4:批 C1-3 把 .map-toolbar 收斂到 #filter-sheet-open／#date-filter／#level-chip
// 三個控件後,現況單列高度為 82px(最高子項 .filter-control--date 64px＋上下 padding 16px＋
// 1px×2 border)。閾值取 110px:高於現況留粗略字型/瀏覽器差異緩衝,但明顯低於任何兩列版面
// 的下限——兩列至少要「最短列 44px ＋ 列間 gap 8px ＋ 最高列 64px ＋ padding16px ＋ border2px」
// ≈134px。.map-toolbar 沒有設 flex-wrap(預設 nowrap),因此目前結構上不可能換列;這條斷言是
// 防止未來有人加 flex-wrap:wrap 或塞回更多控件時的回歸守衛。
test("390px map toolbar renders as a single row", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakeMaps(page);
  await page.goto("/");

  const toolbar = page.locator(".map-toolbar");
  await expect(toolbar).toBeVisible();
  const box = await toolbar.boundingBox();
  expect(box.height).toBeLessThanOrEqual(110);
  expect(runtimeErrors).toEqual([]);
});
