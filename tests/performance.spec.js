import { expect, test } from "@playwright/test";

import { DISCOVERY_WINDOW_DAYS, MAP_IDLE_DEBOUNCE_MS } from "../src/config.js";
import { installAppModuleImporter, installAppTestHooks, readAppTestHook } from "./fixtures/appRuntime.js";
import { installFakeMaps, setFakeMapBounds, setFakeMapBoundsBurst } from "./fixtures/fakeMaps.js";

const isLocalHarness = process.env.TENNIS_TEST_HARNESS_MODE === "local";
const DISCOVERY_SHELL_BUDGET_MS = Number(process.env.TENNIS_DISCOVERY_SHELL_BUDGET_MS ?? 1_000);

if (!Number.isFinite(DISCOVERY_SHELL_BUDGET_MS) || DISCOVERY_SHELL_BUDGET_MS <= 0) {
  throw new Error("TENNIS_DISCOVERY_SHELL_BUDGET_MS must be a positive number.");
}

test.beforeEach(async ({ page }) => installAppModuleImporter(page));

function captureConsoleErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

// 批 D4a:退場的 #date-filter 曾是「一鍵強制零結果」的最簡單控件(同一手法亦見
// tests/smoke.spec.js)。文山區在 mockData.js 的 8 局中零命中(courtDistrict 只
// 出現內湖/中山/中正/士林/萬華五區),是唯一決定性、不受「今天星期幾」影響的選擇。
async function forceZeroMatchDistrictFilter(page) {
  await page.locator("#filter-sheet-open").click();
  await page.locator('#filters-sheet [data-filter="districts"][data-value="文山區"]').click();
  await page.locator('#filters-sheet [data-surface-close]').click();
}

// 批 D4a:退場的 #date-filter 曾用一個不移動焦點的 dispatchEvent(new Event("input"))
// 觸發重繪(setFilter 呼叫本身就會 publish())。改用地圖上「今天」日期 chip,同樣以
// dispatchEvent(而非 Playwright 的 locator.click()——後者會模擬真實滑鼠事件並把焦點
// 移到該 chip 上,破壞這些測試要驗證的「重繪不偷走原本焦點」前提)觸發同一顆按鈕的
// click 監聽器。是否真的改變篩選結果不影響這些測試在意的焦點保留行為。
async function triggerFilterRedraw(page) {
  await page.evaluate(() => {
    document.querySelector('[data-date-chip="today"]')?.dispatchEvent(new Event("click", { bubbles: true }));
  });
}

async function delayMockDiscovery(page, milliseconds) {
  await installAppTestHooks(page, {
    dataApi: { loadSessionDiscovery: { delayMs: milliseconds } },
  });
}

async function failFirstMockDiscovery(page) {
  await installAppTestHooks(page, {
    dataApi: {
      loadSessionDiscovery: { errorMessage: "forced discovery failure", failuresRemaining: 1 },
    },
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
  // 批 D2:v2 兩態,抽屜是非 modal region;開啟後焦點交棒給「✕」。
  await expect(loadingDrawer).toHaveAttribute("role", "region");
  await expect(loadingDrawer.getByRole("status")).toContainText("正在載入球局資料");
  await expect(loadingDrawer.locator("#discovery-empty")).toHaveCount(0);
  await expect(loadingDrawer.locator("[data-nearby-close]")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawerToggle).toBeFocused();
  await expect(baseCourtPin).toBeVisible();
  await baseCourtPin.click();
  await expect(page.locator("#court-session-sheet")).toBeVisible();
  expect(Date.now() - startedAt).toBeLessThan(DISCOVERY_SHELL_BUDGET_MS);

  await page.keyboard.press("Escape");
  await expect(baseCourtPin).toBeFocused();
  await expect(loadingStatus).toBeHidden({ timeout: 3_500 });

  await drawerToggle.click();
  await expect(page.locator("[data-testid='session-card']").first()).toBeVisible();
  await expect.poll(() => readAppTestHook(page, ["dataApi", "loadSessionDiscovery", "consumedCount"])).toBeGreaterThanOrEqual(1);
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
  const drawer = page.getByRole("region", { name: "附近球局" });
  await expect(drawer.getByRole("alert")).toContainText("球局資料暫時無法載入");
  const retry = drawer.locator("#drawer-map-retry");
  await retry.click();
  await expect(drawer).toBeVisible();
  await expect(drawer.locator("[data-testid='session-card']").first()).toBeVisible();
  await expect(mapStatus).toBeHidden();
  await expect.poll(() => readAppTestHook(page, ["dataApi", "loadSessionDiscovery", "consumedCount"])).toBeGreaterThanOrEqual(1);
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
  // 批 D2:v2 兩態抽屜是非 modal region(無 Tab trap),開啟後焦點交棒給「✕」。
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");
  const drawer = page.getByRole("region", { name: "附近球局" });
  const drawerClose = drawer.getByRole("button", { name: "關閉附近球局" });
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
  // 批 C3-2:join 確認態併進同一張 detail sheet,不再是獨立 dialog——這裡改用
  // openSessionSheet 的 initialStage:"confirming" 直接開一張已在確認態的 sheet,
  // 驗證 Tab trap 涵蓋「×」關閉鈕與 confirming 態的取消/確認送出兩鈕。
  await page.evaluate(async () => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    openSessionSheet(
      {
        court: "示範球場",
        courtDistrict: "大安區",
        hostNickname: "示範松果",
        hostNtrp: 3.5,
        hostProfileComplete: true,
        notes: "鍵盤測試",
        ntrpMax: 4,
        ntrpMin: 3,
        playType: "單打",
        sessionId: 9401,
        slotsRemaining: 1,
        startAt: "2099-07-18T01:30:00.000Z",
      },
      { action: { label: "申請加入", kind: "join", expectedAccepted: false }, initialStage: "confirming" }
    );
  });
  const confirmation = page.getByRole("dialog", { name: "球局詳情" });
  const confirmationClose = confirmation.getByRole("button", { name: "關閉球局詳情" });
  const confirmationCancel = confirmation.getByTestId("join-cancel");
  const confirmationSubmit = confirmation.getByTestId("join-confirm");
  // confirming 進場焦點落在態內第一個可操作元素(取消),不是 sheet 的「×」。
  await expect(confirmationCancel).toBeFocused();
  await confirmationCancel.press("Shift+Tab");
  await expect(confirmationClose).toBeFocused();
  await confirmationClose.press("Shift+Tab");
  await expect(confirmationSubmit).toBeFocused();
  await confirmationSubmit.press("Tab");
  await expect(confirmationClose).toBeFocused();
  // 假設 1:confirming 態 Escape 先退回 idle,sheet 不關;第二次 Escape 才關閉。
  // C3 final review polish:退回 idle 時焦點優先落主 CTA。
  await page.keyboard.press("Escape");
  await expect(confirmation.locator('[data-join-stage="idle"]')).toBeVisible();
  const idlePrimaryCta = confirmation.locator('[data-session-action="primary"]');
  await expect(idlePrimaryCta).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(createTrigger).toBeFocused();

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await window.__importAppModule("sessionViews");
    openCreateSessionSheet({ courts: [{ city: "台北市", district: "大安區", id: 8, name: "示範球場" }] });
  });
  // 批 D5:開球局改全螢幕殼,「×」變成左上 40px→44px 返回鈕,aria-label 沿用
  // 「關閉開球局」不變;成功頁預設 hidden,不進 tab 序列,所以殼內最後一個可
  // tab 到的元素仍是固定底鈕(發布球局)。
  const createSheet = page.getByRole("dialog", { name: "開球局" });
  const createClose = createSheet.getByRole("button", { name: "關閉開球局" });
  const createSubmit = createSheet.getByTestId("session-submit");
  await expect(createClose).toBeFocused();
  await createClose.press("Shift+Tab");
  await expect(createSubmit).toBeFocused();
  await createSubmit.press("Tab");
  await expect(createClose).toBeFocused();

  // 批 D5:「進階設定」details/summary 退場,改用 mode-conditional 區塊(hidden
  // 屬性驅動)。同一個「非目前分支的欄位不進焦點/tab 序列」不變量改驗證:切到
  // 候選模式後,候選球場 grid 可聚焦、已定模式的球場 grid 變 hidden;切回去則相反。
  const createForm = createSheet.getByTestId("session-form");
  await createForm.getByTestId("session-venue-candidates").click();
  await expect(createForm.getByTestId("session-candidate-courts")).toBeVisible();
  await expect(createForm.getByTestId("session-court")).toBeHidden();
  const firstCandidateCourt = createForm.getByTestId("create-candidate-court-8");
  await firstCandidateCourt.focus();
  await expect(firstCandidateCourt).toBeFocused();
  await createForm.getByTestId("create-mode-fixed").click();
  await expect(createForm.getByTestId("session-court")).toBeVisible();
  await expect(createForm.getByTestId("session-candidate-courts")).toBeHidden();
  const firstFixedCourt = createForm.getByTestId("create-court-8");
  await firstFixedCourt.focus();
  await expect(firstFixedCourt).toBeFocused();

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
  const drawer = page.getByRole("region", { name: "附近球局" });
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
  await triggerFilterRedraw(page);
  await expect(toggle).toBeFocused();

  await forceZeroMatchDistrictFilter(page);
  await toggle.click();
  const first = page.locator("#discovery-first");
  await expect(first).toBeVisible();
  await first.focus();
  await triggerFilterRedraw(page);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)).toBe("discovery-first");

  // 對稱案例：批 B-4 fix round 1 補了 DRAWER_ACTION_IDS 收 "discovery-subscribe"，這裡鎖住
  // 回歸——沒收的話，這顆按鈕上的鍵盤焦點在抽屜重繪時會被 drawerRecoveryTarget() fallback
  // 誤導去 #discovery-expand，而不是留在原按鈕上。
  const subscribe = page.locator("#discovery-subscribe");
  await expect(subscribe).toBeVisible();
  await subscribe.focus();
  await triggerFilterRedraw(page);
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

  await forceZeroMatchDistrictFilter(page);
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

  // 批 D4a:退場的 #date-filter 曾在同一個同步 evaluate 區塊內把「篩選出零結果」與
  // 「開抽屜→聚焦並點擊 reset」串在一起,刻意不讓任何一步跨到下一個 tick,重現這個
  // race。改用篩選 sheet(行政區 chip「文山區」保證零命中,理由同上方 helper)完成
  // 同一件事,一樣全部留在同一個同步區塊內。
  await page.evaluate(() => {
    document.querySelector("#filter-sheet-open")?.click();
    document.querySelector('#filters-sheet [data-filter="districts"][data-value="文山區"]')?.click();
    document.querySelector('#filters-sheet [data-surface-close]')?.click();
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

test("a 390×667 open drawer reveals at least 1 session card without scrolling", async ({ page }) => {
  // 批 D2:v2 抽屜固定 top:31%、貼導覽列上緣(dc L136),露卡空間遠大於舊 45dvh 半開,
  // 「露卡 ≥1」守衛沿用(user 於批 C2 拍板的目標值),量測容器改為 .nearby-drawer__scroll。
  test.skip(isLocalHarness, "This is a deterministic layout check independent of the data source.");
  const runtimeErrors = captureConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 667 });
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");
  // 等 qmSheetUp 進場動畫收斂再量,避免拿到滑入中的幾何。
  await page.locator("#nearby-sessions-list").evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));

  const measurement = await page.evaluate(() => {
    const list = document.getElementById("nearby-sessions-list");
    const scroll = list.querySelector(".nearby-drawer__scroll");
    const cards = [...list.querySelectorAll("[data-testid='session-card']")];
    if (cards.length < 2 || !scroll) return null;
    // .nearby-drawer__scroll 是唯一滾動層(overflow-y:auto+flex:1),其 rect 已被抽屜
    // 高度裁切,直接相減即為可視高度。
    const listBottom = scroll.getBoundingClientRect().bottom;
    const firstCardRect = cards[0].getBoundingClientRect();
    return { revealedHeight: listBottom - firstCardRect.top, cardHeight: firstCardRect.height };
  });
  expect(measurement).not.toBeNull();
  expect(measurement.revealedHeight / measurement.cardHeight).toBeGreaterThanOrEqual(1);
  expect(runtimeErrors).toEqual([]);
});

// 批 D4a:.map-toolbar 改為 dc L100 的可橫向捲動 chip 列(overflow-x:auto,
// 無 flex-wrap),六顆 chip(今天/明天/週末/程度/直接加入/篩選)在窄視窗下用捲動
// 而非換行容納,單列高度理論上限是 44px(手機斷點 chip 高)＋padding-bottom 3px
// ＋些許字型渲染誤差。閾值維持 110px(遠高於現況、但明顯低於任何換行版面的下限),
// 用意不變:防止未來有人移除 overflow-x:auto 或加回 flex-wrap 造成換行的回歸。
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
