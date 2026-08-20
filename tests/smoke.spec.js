import { expect, test } from "@playwright/test";
import { installAppModuleImporter, installAppTestHooks, readAppTestHook } from "./fixtures/appRuntime.js";
import { expectWithinViewport, installFakeMaps, setFakeMapBounds } from "./fixtures/fakeMaps.js";

test.beforeEach(async ({ page }) => installAppModuleImporter(page));

const publicSurface = (page) => page.locator("#app");

const TAINTED_PUBLIC_VALUES = [
  "TAINT_LINE_ID",
  "TAINT_PROFILE_ID",
  "TAINT_HOST_PROFILE_ID",
  "TAINT_REAL_NAME",
  "TAINT_PROFILE_URL",
  "TAINT_SOURCE_URL",
  "TAINT_USUAL_COURTS",
];

async function installTaintedMockSessions(page) {
  await installAppTestHooks(page, {
    mockData: {
      sessionTaint: {
        lineId: "TAINT_LINE_ID",
        profileId: "TAINT_PROFILE_ID",
        hostProfileId: "TAINT_HOST_PROFILE_ID",
        realName: "TAINT_REAL_NAME",
        profileUrl: "TAINT_PROFILE_URL",
        sourceUrl: "TAINT_SOURCE_URL",
        usualCourts: "TAINT_USUAL_COURTS",
      },
    },
  });
}

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

async function delayMockCourts(page, milliseconds) {
  await installAppTestHooks(page, {
    dataApi: { loadCourts: { delayMs: milliseconds } },
  });
}

// 批 D4a:退場的 #date-filter 曾是「一鍵強制零結果」的最簡單控件。新模型下 districts
// 是唯一能可靠、決定性地清空結果集的維度——文山區在 mockData.js 的 8 局中零命中
// (courtDistrict 只出現內湖/中山/中正/士林/萬華五區,見批次回報),不像 dateKey=weekend
// 那樣會隨「今天是星期幾」而不穩定。
async function forceZeroMatchDistrictFilter(page) {
  await page.locator("#filter-sheet-open").click();
  await page.locator('#filters-sheet [data-filter="districts"][data-value="文山區"]').click();
  await page.locator('#filters-sheet [data-surface-close]').click();
}

test("mock mode never loads or requests Vercel Analytics", async ({ page }) => {
  const analyticsRequests = [];
  page.on("request", (request) => {
    if (/@vercel\/analytics|\/_vercel\/insights\/|vercel-scripts\.com/i.test(request.url())) {
      analyticsRequests.push(request.url());
    }
  });
  await installFakeMaps(page);
  await page.goto("/?s=mock-source#/session/9001");
  await expect(page.getByRole("region", { name: "台北市球局地圖" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  await expect(page.locator('script[src*="_vercel/insights"], script[src*="vercel-scripts"]')).toHaveCount(0);
  expect(await page.evaluate(() => typeof window.va)).toBe("undefined");
  expect(analyticsRequests).toEqual([]);
});

test("My Sessions segment switching redraws from the latest rendered snapshot", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    const session = (sessionId, court, viewerRole) => ({
      court,
      courtDistrict: "萬華區",
      hostNickname: "主揪",
      hostNtrp: 3.5,
      ntrpMax: 4,
      ntrpMin: 3,
      playType: "雙打",
      sessionId,
      slotsRemaining: 1,
      startAt: "2099-08-18T10:00:00+08:00",
      status: "open",
      viewerParticipantStatus: "accepted",
      viewerRole,
    });
    const groups = (hostedSession) => ({
      history: [],
      needsAction: [],
      needsActionCount: 0,
      upcoming: [session(8800, "目前報名場", "guest"), hostedSession],
    });
    renderMySessionsPage(root, {
      authenticated: true,
      groups: groups(session(8801, "過期主揪場", "host")),
    });
    const queuedHostedSegmentClick = root.querySelector("[data-my-sessions-seg='hosted']");
    renderMySessionsPage(root, {
      authenticated: true,
      groups: groups(session(8802, "最新主揪場", "host")),
    });
    window.__runQueuedHostedSegmentClick = () => queuedHostedSegmentClick.click();
  });

  await page.evaluate(() => window.__runQueuedHostedSegmentClick());
  await expect(page.locator("#my-sessions-root")).toContainText("最新主揪場");
  await expect(page.locator("#my-sessions-root")).not.toContainText("過期主揪場");
});

test("anonymous map discovery renders only safe SessionSummary fields", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await installGeolocation(page, [{ coords: { latitude: 25.03, longitude: 121.55 } }]);
  await page.goto("/");

  // 球咖改名工程:品牌 title 此前零覆蓋,順手補行為層斷言。
  await expect(page).toHaveTitle(/球咖/);
  await expect(page.getByRole("region", { name: "台北市球局地圖" })).toBeVisible();
  await expect(page.locator("#map")).toHaveAttribute("data-fake-google-map", "ready");
  await expect(page.locator("#use-my-location")).toBeVisible();
  // 批 D2:aside 容器本身無版面(子面板各自 fixed),可見性斷言改看 peek 列。
  await expect(page.locator("#nearby-sessions-toggle")).toBeVisible();
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#nearby-sessions-summary")).toContainText("這個地圖範圍內");
  await expect(page.locator("#nearby-sessions-list")).toBeHidden();
  await expect(page.getByTestId("create-session-tab")).toBeVisible();
  await expect(page.getByTestId("player-layer-toggle")).toBeVisible();
  await expect(page.getByTestId("player-layer-toggle")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("player-layer-toggle")).toHaveText("顯示在線");
  // 批 D4a:球友名單鈕改 icon-only,可讀名稱走 aria-label,不再是可見文字。
  await expect(page.getByTestId("player-directory-open")).toHaveAttribute("aria-label", "球友名單");
  await expect(page.locator("#filter-sheet-open")).toHaveText("篩選");
  await expect(page.locator("#filter-sheet-open")).toHaveAttribute("aria-label", "篩選");
  await page.locator("#filter-sheet-open").click();
  const filterSheet = page.locator("#filters-sheet");
  await expect(filterSheet).toBeVisible();
  await expect(filterSheet.locator('[data-filter="types"]').first()).toHaveAttribute("aria-pressed", "false");
  await expect(filterSheet.locator('[data-filter="districts"]').first()).toHaveAttribute("aria-pressed", "false");
  // 預設 band 就是 "all",開啟 sheet 時應已是選中態(不像 types/districts 預設全空)。
  await expect(filterSheet.locator('[data-filter="band"][data-value="all"]')).toHaveAttribute("aria-pressed", "true");
  await filterSheet.locator('[data-filter="types"][data-value="單打"]').click();
  await expect(filterSheet.locator('[data-filter="types"][data-value="單打"]')).toHaveAttribute("aria-pressed", "true");
  await filterSheet.locator('[data-filter="districts"][data-value="內湖區"]').click();
  await expect(filterSheet.locator('[data-filter="districts"][data-value="內湖區"]')).toHaveAttribute("aria-pressed", "true");
  await filterSheet.locator('[data-filter="band"][data-value="mid"]').click();
  await expect(filterSheet.locator('[data-filter="band"][data-value="mid"]')).toHaveAttribute("aria-pressed", "true");
  await expect(filterSheet.locator('[data-filter="band"][data-value="all"]')).toHaveAttribute("aria-pressed", "false");
  // sheet 開著時,badge N 與地圖上仍看得到的程度控件都要同步鏡像。批 D4a:badge
  // 只計 types+districts 選取數(=2),不含 band,所以不是 3。
  await expect(page.locator("#filter-sheet-open")).toHaveText("篩選 ⋅2");
  await expect(page.locator("#filter-sheet-open")).toHaveAttribute("aria-label", "篩選，已套用 2 組條件");
  await expect(page.locator("#band-options [data-band='mid']")).toHaveAttribute("aria-pressed", "true");
  await filterSheet.locator('[data-filter="reset"]').click();
  await expect(filterSheet.locator('[data-filter="types"][data-value="單打"]')).toHaveAttribute("aria-pressed", "false");
  await expect(filterSheet.locator('[data-filter="districts"][data-value="內湖區"]')).toHaveAttribute("aria-pressed", "false");
  await expect(filterSheet.locator('[data-filter="band"][data-value="all"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#filter-sheet-open")).toHaveText("篩選");
  await expect(page.locator("#filter-sheet-open")).toHaveAttribute("aria-label", "篩選");
  await expect(page.locator("#band-options [data-band='all']")).toHaveAttribute("aria-pressed", "true");
  await filterSheet.locator("[data-surface-close]").click();
  await expect(filterSheet).toBeHidden();
  await expect(page.locator("#filter-sheet-open")).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__geolocationCallCount())).toBe(0);

  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "true");
  // 批 D2:v2 兩態,open 是非 modal region——無 backdrop、無 inert isolation,
  // 地圖與頁面殼恆可互動;開啟後焦點交棒給「✕」。
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("role", "region");
  // Live-region count announcements live on a node outside the drawer's
  // destroy-and-rebuild subtree (see the dedicated aria-live test below) so a
  // freshly created node never has to pick up its aria-live wiring mid-mutation.
  await expect(page.locator("#nearby-sessions-count-status")).toHaveAttribute("aria-live", "polite");
  await expect(page.locator("#nearby-sessions-backdrop")).toHaveCount(0);
  await expect(page.locator(".map-topbar")).toHaveJSProperty("inert", false);
  await expect(page.locator("#map")).toHaveJSProperty("inert", false);
  await expect(page.locator("[data-nearby-close]")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#nearby-sessions-toggle")).toBeFocused();

  await page.locator("#nearby-sessions-toggle").click();
  const firstCard = page.locator("[data-testid='session-card']").first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard).toContainText("示範");
  await expect(firstCard).toContainText("NTRP");

  const exposed = await publicSurface(page).innerText();
  expect(exposed).not.toMatch(/amber\.tw|hsu_tennis|facebook\.com|ptt\.cc|LINE ID/i);
  expect(exposed).not.toMatch(/profile[_ -]?id|真名|常打球場/i);
  const renderedMarkerAttributes = await page.locator(".test-marker").evaluateAll((markers) =>
    markers.map((marker) => ({ title: marker.getAttribute("title"), aria: marker.getAttribute("aria-label") }))
  );
  expect(JSON.stringify(renderedMarkerAttributes)).not.toMatch(/amber|line|profile|source|http/i);
  expect(runtimeErrors).toEqual([]);
});

// 批 D4a:badge N 改為只計 types+districts 選取數(dc L913 拍板),dateKey/band 兩者
// 即使切換也不移動 badge——這裡先證明「不移動」這件事本身,再證明真正會移動 badge
// 的兩個維度確實逐一增減正確,而不是只測「有變化」就當通過。
test("the filter badge counts only types+districts and mirrors dateKey/band both ways with the sheet", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  // 地圖→sheet:先在地圖上改日期與程度,再開 sheet,驗證 sheet 開啟時已帶入目前
  // 狀態,而 badge 全程維持「篩選」無數字。
  await page.locator('[data-date-chip="today"]').click();
  await expect(page.locator('[data-date-chip="today"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#filter-sheet-open")).toHaveText("篩選");
  await page.locator("#level-chip").click();
  await page.locator("#band-options [data-band='hi']").click();
  await expect(page.locator("#filter-sheet-open")).toHaveText("篩選");
  await expect(page.locator("#filter-sheet-open")).toHaveAttribute("aria-label", "篩選");

  await page.locator("#filter-sheet-open").click();
  const filterSheet = page.locator("#filters-sheet");
  await expect(filterSheet.locator('[data-filter="dateKey"][data-value="today"]')).toHaveAttribute("aria-pressed", "true");
  await expect(filterSheet.locator('[data-filter="band"][data-value="hi"]')).toHaveAttribute("aria-pressed", "true");

  // sheet→地圖:sheet 開著時改日期與程度,地圖上(雖已 inert 不可點)仍要看得到鏡像後的值。
  await filterSheet.locator('[data-filter="dateKey"][data-value="tomorrow"]').click();
  await filterSheet.locator('[data-filter="band"][data-value="pro"]').click();
  await expect(page.locator("#filter-sheet-open")).toHaveText("篩選");
  await expect(page.locator('[data-date-chip="tomorrow"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-date-chip="today"]')).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#band-options [data-band='pro']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#band-options [data-band='hi']")).toHaveAttribute("aria-pressed", "false");

  // badge N 隨欄位一個個增加:疊加一個打法與一個行政區。
  await filterSheet.locator('[data-filter="types"][data-value="雙打"]').click();
  await expect(page.locator("#filter-sheet-open")).toHaveText("篩選 ⋅1");
  await filterSheet.locator('[data-filter="districts"][data-value="內湖區"]').click();
  await expect(page.locator("#filter-sheet-open")).toHaveText("篩選 ⋅2");

  // 再一個個減少:回到「不限」/全部,dateKey 與 band 保留(不影響 badge),
  // 只有 types/districts 清空才讓 badge 消失。
  await filterSheet.locator('[data-filter="districts"][data-value="內湖區"]').click();
  await expect(page.locator("#filter-sheet-open")).toHaveText("篩選 ⋅1");
  await filterSheet.locator('[data-filter="types"][data-value="雙打"]').click();
  await expect(page.locator("#filter-sheet-open")).toHaveText("篩選");
  await expect(page.locator("#filter-sheet-open")).toHaveAttribute("aria-label", "篩選");
  // dateKey/band 兩者仍維持上面選的值,證明清空 badge 不代表這兩者被重設。
  await expect(filterSheet.locator('[data-filter="dateKey"][data-value="tomorrow"]')).toHaveAttribute("aria-pressed", "true");
  await expect(filterSheet.locator('[data-filter="band"][data-value="pro"]')).toHaveAttribute("aria-pressed", "true");

  expect(runtimeErrors).toEqual([]);
});

test("the persistent count live region announces the current session count and updates when a filter narrows it", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const countStatus = page.locator("#nearby-sessions-count-status");
  await expect(countStatus).toHaveAttribute("aria-live", "polite");
  await expect(countStatus).toHaveAttribute("aria-atomic", "true");
  // mock 共 8 局,9003 額滿:計數只算真可加入的 7 局(2026-08-17 拍板)。
  await expect(countStatus).toHaveText(/7 場可加入/);

  await page.locator("#filter-sheet-open").click();
  await page.locator('#filters-sheet [data-filter="districts"][data-value="內湖區"]').click();

  await expect(countStatus).toHaveText(/2 場可加入/);
  expect(runtimeErrors).toEqual([]);
});

test("an undecided candidate session renders two dashed map pins from the court catalogue", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");

  await expect
    .poll(async () => {
      const options = await page.evaluate(() => window.__fakeMapsSnapshot().visibleMarkerOptions);
      return options.filter(({ title }) => title?.includes("未定"));
    })
    .toHaveLength(2);
  const visibleMarkerOptions = await page.evaluate(() => window.__fakeMapsSnapshot().visibleMarkerOptions);
  const undecided = visibleMarkerOptions.filter(({ title }) => title?.includes("未定"));
  expect(undecided.map(({ title }) => title).sort()).toEqual([
    "球局 · 百齡河濱公園網球場 · 未定",
    "球局 · 美堤河濱公園網球場 · 未定",
  ]);
  // 批 D3:v2 候選釘 dashed 磚的 dasharray 為 4 3(dc L65)。
  expect(undecided.every(({ iconUrl }) => decodeURIComponent(iconUrl).includes('stroke-dasharray="4 3"'))).toBe(true);
  // 2026-08-17 降級顯示:滿員局(mock 9003 古亭)圖釘轉灰磚,不得與可加入局同色。
  const fullPin = visibleMarkerOptions.find(({ title }) => title?.includes("球局 · 古亭河濱公園網球場"));
  expect(fullPin, "the full session pin exists on the map (nonempty scan)").toBeTruthy();
  expect(decodeURIComponent(fullPin.iconUrl)).toContain('stroke="#8b978d"');
  const openPins = visibleMarkerOptions.filter(({ title }) => title?.includes("球局") && !title.includes("古亭") && !title.includes("未定"));
  expect(openPins.length).toBeGreaterThan(0);
  expect(openPins.every(({ iconUrl }) => !decodeURIComponent(iconUrl).includes('stroke="#8b978d"'))).toBe(true);
  const mockCandidateOverlap = await page.evaluate(async () => {
    const { MOCK_SESSIONS } = await window.__importAppModule("mockData");
    const undecidedSession = MOCK_SESSIONS.find(({ sessionId }) => sessionId === 9005);
    const decidedSession = MOCK_SESSIONS.find(({ sessionId }) => sessionId === 9006);
    return undecidedSession.candidateCourtIds.includes(decidedSession.courtId);
  });
  expect(mockCandidateOverlap).toBe(false);
});

test("decision sheet waits for the court catalogue and renders candidate buttons after refill", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openDecideSessionSheet } = await window.__importAppModule("sessionViews");
    window.__stage4cDecisionSheet = openDecideSessionSheet(
      {
        sessionId: 9005,
        startAt: "2099-08-08T01:00:00.000Z",
        rangeEnd: "2099-08-08T04:00:00.000Z",
        venueType: "candidates",
        candidateCourtIds: [105, 109],
        decidedAt: "",
      },
      { courts: [], courtsReady: false }
    );
  });

  const sheet = page.locator("#session-decision-sheet");
  await expect(sheet.locator("[data-decision-terminal]")).toBeHidden();
  await expect(sheet.locator("[data-decision-courts-status]")).toHaveText("正在載入候選球場…");
  await expect(sheet.locator("[data-decide-court]")).toHaveCount(0);

  await page.evaluate(async () => {
    const { COURTS } = await window.__importAppModule("mockData");
    window.__stage4cDecisionSheet.setCourts(COURTS, { ready: true });
  });
  await expect(sheet.locator("[data-decide-court]")).toHaveCount(2);
  await expect(sheet.getByRole("button", { name: "百齡河濱公園網球場" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "美堤河濱公園網球場" })).toBeVisible();
  await expect(sheet.locator("[data-decision-terminal]")).toBeHidden();
});

// 批 8.5 rider(併入批 8.6):鎖住定案 sheet 的 generation key 語意。送出中刷新候選
// 球場目錄會重建全部按鈕節點(等同舊 innerHTML 整段置換),runAsyncAction 的
// rerendered() 因此為真,decide resolve 之後不還原控制項;若改用穩定 key,倖存的
// 舊節點會讓 rerendered() 變 false,送出中刷新目錄後按鈕會被不該地重新可按。
test("refreshing the court catalogue during an in-flight decide detaches the buttons and leaves them locked after it resolves", async ({
  page,
}) => {
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openDecideSessionSheet } = await window.__importAppModule("sessionViews");
    const { COURTS } = await window.__importAppModule("mockData");
    window.__decideGenerationCourts = COURTS;
    window.__decideGenerationCalls = [];
    window.__releaseDecideGeneration = () => {};
    window.__decideGenerationSheet = openDecideSessionSheet(
      {
        sessionId: 9005,
        startAt: "2099-08-08T01:00:00.000Z",
        rangeEnd: "2099-08-08T04:00:00.000Z",
        venueType: "candidates",
        candidateCourtIds: [105, 109],
        decidedAt: "",
      },
      {
        courts: COURTS,
        courtsReady: true,
        onDecide: (courtId, startAt) => {
          window.__decideGenerationCalls.push([courtId, startAt]);
          return new Promise((resolve) => {
            window.__releaseDecideGeneration = resolve;
          });
        },
      }
    );
  });

  const sheet = page.locator("#session-decision-sheet");
  await expect(sheet.locator("[data-decide-court]")).toHaveCount(2);

  await sheet.getByTestId("decide-court-105").click();
  await expect.poll(() => page.evaluate(() => window.__decideGenerationCalls.length)).toBe(1);
  await expect(sheet.getByTestId("decide-court-105")).toBeDisabled();
  await expect(sheet.getByTestId("decide-court-109")).toBeDisabled();

  // 送出中刷新目錄:舊按鈕必須離開 DOM——這正是 runAsyncAction 判定 rerendered 的依據。
  await page.evaluate(() => {
    window.__decideButtonBeforeRefresh = document.querySelector('[data-decide-court="105"]');
    window.__decideGenerationSheet.setCourts(window.__decideGenerationCourts, { ready: true });
  });
  await expect(sheet.locator("[data-decide-court]")).toHaveCount(2);
  expect(
    await page.evaluate(() => window.__decideButtonBeforeRefresh.isConnected),
    "the in-flight refresh must detach the pre-refresh candidate button"
  ).toBe(false);
  await expect(sheet.getByTestId("decide-court-105")).toBeDisabled();

  // 定案 resolve 之後控制項不還原。先用兩輪 macrotask 排空 microtask,若「還原」真的
  // 會發生就一定已經發生,最後的斷言才不會在還原前假綠。
  await page.evaluate(async () => {
    window.__releaseDecideGeneration("OK");
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const disabledAfterResolve = await page.evaluate(() =>
    [...document.querySelectorAll("[data-decide-court]")].map((button) => button.disabled)
  );
  expect(disabledAfterResolve.length, "the candidate button scan must be nonempty").toBeGreaterThan(0);
  expect(disabledAfterResolve).toEqual([true, true]);
});

test("a hash session link opens its detail, copies a stable share link, and gives an empty state when unavailable", async ({ baseURL, page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__copiedSessionLink = value;
        },
      },
    });
  });
  await installFakeMaps(page);
  await page.goto("/#/session/9001");

  const detail = page.locator("#session-sheet");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("台北網球中心");
  await detail.locator("[data-session-action='copy-link']").click();
  // 由 baseURL 推導,不寫死 port:同一支測試在 mock 兩個 project 之外若換 port 也不會假紅。
  await expect
    .poll(() => page.evaluate(() => window.__copiedSessionLink))
    .toBe(new URL("/#/session/9001", baseURL).toString());
  await expect(page.locator("#toast-root")).toContainText("球局連結已複製");

  await page.goto("/#/session/999999");
  await expect(page.locator("#session-unavailable-sheet")).toBeVisible();
  await expect(page.locator("#session-unavailable-sheet")).toContainText("找不到這個球局");
  expect(runtimeErrors).toEqual([]);
});

test("instant join session 9002 shows its badge and direct CTA on card and detail", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  const instantCard = page.locator("[data-session-id='9002']").first();
  await expect(instantCard.locator(".session-badge--instant")).toHaveText("直接加入");
  await instantCard.click();

  const detail = page.locator("#session-sheet");
  await expect(detail.locator(".session-badge--instant")).toHaveText("直接加入");
  await expect(detail.getByRole("button", { name: "直接加入" })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("ongoing session 9001 shows its badge and elapsed time on card and detail", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  const ongoingCard = page.locator("[data-session-id='9001']").first();
  // 批 D2:v2 卡片只掛「進行中」badge(dc L162),已開打分鐘數只在詳情呈現。
  await expect(ongoingCard.locator(".session-badge--ongoing")).toHaveText("進行中");
  await expect(ongoingCard.locator(".time-tile--ongoing")).toBeVisible();
  await ongoingCard.click();

  const detail = page.locator("#session-sheet");
  await expect(detail.locator(".session-badge--ongoing")).toHaveText("進行中");
  await expect(detail).toContainText(/已開打 \d+ 分鐘/);
  expect(runtimeErrors).toEqual([]);
});

test("four destinations expose an anonymous Me page while the map header stays minimal", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await expect(page.locator(".bottom-navigation__item")).toHaveCount(4);
  // 批 D4a:app-header 退場,「頁首維持極簡」的守衛改看頂列 row1(品牌磚／城市
  // chip／球友名單鈕三項,與退場前的 app-header 子項數一致)。
  await expect(page.locator(".map-topbar__row > *")).toHaveCount(3);
  await expect(page.locator("#open-session, #open-my-sessions, .site-links")).toHaveCount(0);
  await page.getByTestId("me-tab").click();
  await expect(page.locator("#tab-map")).toBeHidden();
  await expect(page.locator("#my-sessions-page")).toBeHidden();
  await expect(page.locator("#me-page")).toBeVisible();
  await expect(page.getByTestId("me-sign-in")).toBeVisible();
  await expect(page.getByRole("link", { name: "隱私權政策" })).toHaveAttribute("href", "/privacy.html");
  const support = page.getByRole("link", { name: "聯絡支援" });
  await expect(support).toBeVisible();
  await expect(support).toHaveAttribute("href", "mailto:support@example.test");

  await page.getByTestId("my-sessions-tab").click();
  await expect(page.locator("#tab-map")).toBeHidden();
  await expect(page.locator("#my-sessions-page")).toBeVisible();
  await expect(page.locator("#me-page")).toBeHidden();
  await page.getByTestId("map-tab").click();
  await expect(page.locator("#tab-map")).toBeVisible();
  await expect(page.locator("#my-sessions-page")).toBeHidden();
  await expect(page.locator("#me-page")).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions has a bottom navigation destination and stays isolated beneath the nearby drawer", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const mySessionsTab = page.getByTestId("my-sessions-tab");
  await expect(mySessionsTab).toBeVisible();
  await mySessionsTab.click();
  await expect(page.locator("#tab-map")).toBeHidden();
  await expect(page.locator("#my-sessions-page")).toBeVisible();
  await expect(page.locator("#my-needs-action")).toBeVisible();
  await expect(page.locator("#my-upcoming-sessions")).toBeVisible();
  await expect(page.locator("#my-history")).toBeVisible();
  await expect(page.locator("#my-sessions-refresh")).toBeVisible();

  await page.getByTestId("map-tab").click();
  await expect(page.locator("#tab-map")).toBeVisible();
  // 批 D2:v2 抽屜非 modal,導覽列在抽屜開著時仍可互動(不 inert),Escape 收合。
  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");
  await expect(page.locator(".bottom-navigation")).toHaveJSProperty("inert", false);
  await page.keyboard.press("Escape");
  await expect(page.locator("#nearby-sessions-list")).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

// 批 D7:五格導覽(抽取規格 §1)——找球局/我的球局/置中開球局/訊息/我逐字順序;
// 徽章分工雙向驗證:數字徽章只在「我的球局」格內、未讀圓點只在「訊息」格內,
// 兩者互不越界(D7 派工單映射決策 2)。
test("bottom navigation renders five items in dc order and splits the badge/dot between my-sessions and messages", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const items = page.locator(".bottom-navigation > button");
  await expect(items).toHaveCount(5);
  await expect(items.nth(0)).toHaveAttribute("data-testid", "map-tab");
  await expect(items.nth(1)).toHaveAttribute("data-testid", "my-sessions-tab");
  await expect(items.nth(2)).toHaveAttribute("data-testid", "create-session-tab");
  await expect(items.nth(3)).toHaveAttribute("data-testid", "messages-tab");
  await expect(items.nth(4)).toHaveAttribute("data-testid", "me-tab");

  await expect(page.locator("#my-sessions-tab #my-sessions-badge")).toHaveCount(1);
  await expect(page.locator("#my-sessions-tab #my-sessions-unread-dot")).toHaveCount(0);
  await expect(page.locator("#messages-tab #my-sessions-unread-dot")).toHaveCount(1);
  await expect(page.locator("#messages-tab #my-sessions-badge")).toHaveCount(0);

  await page.getByTestId("messages-tab").click();
  await expect(page.locator("#tab-map")).toBeHidden();
  await expect(page.locator("#my-sessions-page")).toBeHidden();
  await expect(page.locator("#me-page")).toBeHidden();
  await expect(page.locator("#messages-page")).toBeVisible();
  await expect(page.getByTestId("messages-tab")).toHaveAttribute("aria-current", "page");
  expect(runtimeErrors).toEqual([]);
});

// 批 D7:訊息頁列(dc §3)——未讀點只出現在 unreadMessageCount>0 的那一列,空清單
// 時只見 dc dashed 空狀態框,兩者互斥;點列會呼叫 onOpenChat(既有
// controller.openSessionChat 清未讀流程,這裡只驗接線本身)。
test("messages page marks only the unread row, wires row clicks to onOpenChat, and mutually excludes its empty state", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { renderMessagesPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("messages-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("messages-page").hidden = false;
    window.__messagesOpened = [];
    renderMessagesPage(root, {
      groups: {
        history: [],
        needsAction: [],
        needsActionCount: 0,
        upcoming: [
          {
            court: "青年公園網球場",
            hostNickname: "示範主揪",
            playType: "單打",
            sessionId: 601,
            startAt: "2099-07-19T01:00:00.000Z",
            status: "open",
            unreadMessageCount: 2,
            viewerParticipantStatus: "accepted",
            viewerRole: "guest",
          },
          {
            court: "中山運動中心",
            hostNickname: "另一位主揪",
            playType: "雙打",
            sessionId: 602,
            startAt: "2099-07-20T01:00:00.000Z",
            status: "open",
            unreadMessageCount: 0,
            viewerParticipantStatus: "accepted",
            viewerRole: "host",
          },
        ],
      },
      onOpenChat: (sessionId) => window.__messagesOpened.push(sessionId),
    });
  });

  const unreadRow = page.getByTestId("messages-row-601");
  const readRow = page.getByTestId("messages-row-602");
  await expect(page.locator(".messages-row__unread")).toHaveCount(1);
  await expect(unreadRow.locator(".messages-row__unread")).toHaveCount(1);
  await expect(readRow.locator(".messages-row__unread")).toHaveCount(0);
  // host 視角看自己主揪頭像字顯示「我」,guest 視角顯示主揪暱稱首字(dc §3)。
  await expect(readRow.locator(".messages-row__avatar")).toHaveText("我");
  await expect(unreadRow.locator(".messages-row__avatar")).toHaveText("示");
  await expect(page.locator(".messages-page__empty")).toHaveCount(0);

  await unreadRow.click();
  await expect.poll(() => page.evaluate(() => window.__messagesOpened)).toEqual(["601"]);

  await page.evaluate(async () => {
    const { renderMessagesPage } = await window.__importAppModule("sessionViews");
    renderMessagesPage(document.getElementById("messages-root"), {
      groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [] },
    });
  });
  await expect(page.locator(".messages-row")).toHaveCount(0);
  await expect(page.locator(".messages-page__empty")).toBeVisible();
  await expect(page.locator(".messages-page__empty")).toContainText("成局後群組聊天會出現在這裡");
  expect(runtimeErrors).toEqual([]);
});

// fix round 1(驗收退回,人工實測抓到):分頁完全空時,v2 dc 空狀態框跟「需要你
// 處理」/「即將打球」/「過去紀錄」三段舊佔位文字疊在一起顯示,不符 dc「空分頁只
// 見一個 dashed 框」的意圖。這條鎖住三種分支:全空(只見一個框)、部分空(維持
// 既有三段式,佔位文字照舊)、history 非空但 needsAction/upcoming 空(框跟
// history 卡並存)。
test("My Sessions empty state shows one dc box instead of stacking three placeholder messages", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    window.__renderEmptyCase = (groups) =>
      renderMySessionsPage(document.getElementById("my-sessions-root"), { authenticated: true, groups });
  });

  const root = page.locator("#my-sessions-root");

  // 全空:三段舊佔位文字都不可見,只有 dc 空狀態框;容器 id 仍在 DOM(既有測試/
  // focus 邏輯的錨點),只是內容清空。
  await page.evaluate(() =>
    window.__renderEmptyCase({ history: [], needsAction: [], needsActionCount: 0, upcoming: [] })
  );
  await expect(root).not.toContainText("目前沒有需要立即處理的事項");
  await expect(root).not.toContainText("目前沒有即將打球的球局");
  await expect(root).not.toContainText("尚無過去紀錄");
  await expect(root.locator("[data-my-sessions-empty]")).toBeVisible();
  await expect(root.locator("[data-my-sessions-empty]")).toContainText("還沒報名任何球局");
  await expect(root.locator("#my-needs-action")).toHaveCount(1);
  await expect(root.locator("#my-needs-action")).toBeEmpty();
  await expect(root.locator("#my-upcoming-sessions")).toHaveCount(1);
  await expect(root.locator("#my-upcoming-sessions")).toBeEmpty();
  await expect(root.locator("#my-history")).toHaveCount(1);
  await expect(root.locator("#my-history")).toBeEmpty();

  // 部分空:needsAction 有一項,upcoming/history 仍空——語意不變,兩段舊佔位文字
  // 照常顯示,dc 空狀態框不出現。
  await page.evaluate(() =>
    window.__renderEmptyCase({
      history: [],
      needsAction: [
        {
          kind: "invite",
          session: {
            canRespondInvite: true,
            court: "測試球場",
            hostNickname: "主揪",
            hostNtrp: 4,
            ntrpMax: 5,
            ntrpMin: 3,
            playType: "雙打",
            sessionId: 9601,
            slotsRemaining: 1,
            startAt: "2099-07-19T01:00:00.000Z",
            status: "open",
            viewerParticipantStatus: "invited",
            viewerRole: "guest",
          },
        },
      ],
      needsActionCount: 1,
      upcoming: [],
    })
  );
  await expect(root.locator("[data-my-sessions-empty]")).toHaveCount(0);
  await expect(root).toContainText("目前沒有即將打球的球局");
  await expect(root).toContainText("尚無過去紀錄");

  // history 非空、needsAction/upcoming 空:dc 空狀態框仍出現,但 history 照常
  // 顯示自己的標題與卡片,不收成空容器。
  await page.evaluate(() =>
    window.__renderEmptyCase({
      history: [
        {
          court: "歷史球場",
          hostNickname: "主揪",
          hostNtrp: 4,
          ntrpMax: 5,
          ntrpMin: 3,
          playType: "雙打",
          sessionId: 9602,
          slotsRemaining: 1,
          startAt: "2020-07-19T01:00:00.000Z",
          status: "expired",
          viewerParticipantStatus: "accepted",
          viewerRole: "guest",
        },
      ],
      needsAction: [],
      needsActionCount: 0,
      upcoming: [],
    })
  );
  await expect(root.locator("[data-my-sessions-empty]")).toBeVisible();
  await expect(root).not.toContainText("尚無過去紀錄");
  await expect(root).toContainText("歷史球場");
  await expect(root.locator("#my-needs-action")).toBeEmpty();
  await expect(root.locator("#my-upcoming-sessions")).toBeEmpty();
  expect(runtimeErrors).toEqual([]);
});

test("anonymous session artifacts strip tainted source fields from HTML, data attributes, markers, and captured JSON", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await installTaintedMockSessions(page);
  await page.goto("/");
  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("[data-testid='session-card']").first()).toBeVisible();

  const captured = await page.evaluate(() => {
    const attributeSnapshots = [...document.querySelectorAll("#app, #app *")].map((node) => ({
      dataset: { ...node.dataset },
      dataAttributes: [...node.attributes]
        .filter((attribute) => attribute.name.startsWith("data-"))
        .map((attribute) => [attribute.name, attribute.value]),
    }));
    const renderedMarkerAttributes = [...document.querySelectorAll(".test-marker")].map((marker) => ({
      ariaLabel: marker.getAttribute("aria-label"),
      dataAttributes: [...marker.attributes]
        .filter((attribute) => attribute.name.startsWith("data-"))
        .map((attribute) => [attribute.name, attribute.value]),
      title: marker.getAttribute("title"),
    }));
    return {
      dataAttributes: attributeSnapshots,
      html: document.getElementById("app")?.innerHTML ?? "",
      mapSnapshot: window.__fakeMapsSnapshot(),
      markerAttributes: renderedMarkerAttributes,
    };
  });

  const capturedJson = JSON.stringify(captured);
  for (const value of TAINTED_PUBLIC_VALUES) expect(capturedJson).not.toContain(value);
  const mockSessionCount = await page.evaluate(async () => (await window.__importAppModule("mockData")).MOCK_SESSIONS.length);
  expect(mockSessionCount).toBeGreaterThan(0);
  await expect.poll(() => readAppTestHook(page, ["mockData", "sessionTaint", "appliedCount"])).toBe(mockSessionCount);
  expect(captured.html).toContain("示範松果");
  expect(runtimeErrors).toEqual([]);
});

test("closing the nearby drawer cannot steal focus from a newly selected base-court pin", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("[data-nearby-close]")).toBeFocused();
  await page.keyboard.press("Escape");

  const basePin = page.getByRole("button", { name: /地圖圖釘 球場 青年公園網球場/ });
  await basePin.focus();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(basePin).toBeFocused();

  await basePin.press("Enter");
  await expect(page.locator("#court-session-sheet")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(basePin).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("opening the nearby drawer cannot steal focus from an immediate session-card interaction", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  // Both actions happen before the drawer's deferred initial focus runs. A
  // keyboard or assistive-tech user can similarly reach a card immediately.
  await page.evaluate(() => {
    document.getElementById("nearby-sessions-toggle")?.click();
    document.querySelector("[data-testid='session-card']")?.focus();
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  await expect(page.locator("[data-testid='session-card']").first()).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("the open drawer keeps the map layer hit-testable and its base-court pin clickable", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");
  // qmSheetUp 進場動畫 320ms:滑入中量幾何會拿到中途位置,選出的「未被蓋住」釘
  // 在動畫結束後會被抽屜蓋住(全套件下的間歇紅)。先等動畫收斂再量。
  await page.locator("#nearby-sessions-list").evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  await expect(page.locator("#nearby-sessions-backdrop")).toHaveCount(0);
  await expect(page.locator("#map")).toHaveJSProperty("inert", false);

  // Probe a point that is genuinely open map (below the top overlay, above the
  // open drawer) instead of a fixed corner — at narrow widths the overlay sits
  // in normal flow at the top of .map-page, so a naive top-left probe can land
  // on that legitimate overlay control instead of proving anything about the
  // drawer.
  // 批 D2:抽屜面板改為 fixed 定位的 #nearby-sessions-list(aside 容器本身無版面),
  // 幾何量測以面板為準。批 D4a:probe 邊界改用 .map-topbar(含 chips 列與其
  // padding-bottom 的完整 overlay 高度),取代已改為透明可捲動列的 .map-toolbar,
  // 避免探測點落在 overlay 的留白 padding 內。
  const geometry = await page.evaluate(() => {
    const mapRect = document.getElementById("map").getBoundingClientRect();
    const drawerRect = document.getElementById("nearby-sessions-list").getBoundingClientRect();
    const topbarRect = document.querySelector(".map-topbar")?.getBoundingClientRect() ?? null;
    return {
      mapRect: { x: mapRect.x, y: mapRect.y, width: mapRect.width, height: mapRect.height },
      drawerRect: { x: drawerRect.x, y: drawerRect.y, width: drawerRect.width, height: drawerRect.height },
      openAreaTop: topbarRect ? topbarRect.bottom : mapRect.top,
    };
  });
  const probePoint = {
    x: geometry.mapRect.x + geometry.mapRect.width / 2,
    y: (geometry.openAreaTop + geometry.drawerRect.y) / 2,
  };
  // The probe point must sit outside the half drawer's own box, or a hit
  // there would prove nothing about the map layer being reachable.
  const outsideDrawer =
    probePoint.x < geometry.drawerRect.x ||
    probePoint.x > geometry.drawerRect.x + geometry.drawerRect.width ||
    probePoint.y < geometry.drawerRect.y ||
    probePoint.y > geometry.drawerRect.y + geometry.drawerRect.height;
  expect(outsideDrawer).toBe(true);

  const hit = await page.evaluate(
    ({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return { insideMap: Boolean(element?.closest("#map")) };
    },
    probePoint
  );
  expect(hit.insideMap).toBe(true);

  // Pick whichever base-court pin is not visually covered by the open drawer —
  // at narrow widths the drawer spans nearly the full width across its band,
  // so a hardcoded pin id could legitimately sit underneath it.
  const basePins = page.getByRole("button", { name: /地圖圖釘 球場/ });
  const basePinCount = await basePins.count();
  let clickablePin = null;
  for (let index = 0; index < basePinCount; index += 1) {
    const candidate = basePins.nth(index);
    const box = await candidate.boundingBox();
    if (!box) continue;
    const overlapsDrawer = !(
      box.x + box.width < geometry.drawerRect.x ||
      box.x > geometry.drawerRect.x + geometry.drawerRect.width ||
      box.y + box.height < geometry.drawerRect.y ||
      box.y > geometry.drawerRect.y + geometry.drawerRect.height
    );
    if (!overlapsDrawer) {
      clickablePin = candidate;
      break;
    }
  }
  // At very narrow viewports the open drawer's own band can cover every
  // currently rendered base-court pin (it spans nearly the full width there).
  // That is ordinary z-order occlusion, not the drawer making the map inert —
  // the elementFromPoint/inert assertions above already cover that claim on
  // every project. Skip only the click-through-to-a-pin verification when no
  // pin is geometrically reachable at this viewport.
  test.skip(!clickablePin, "no base-court pin is clear of the open drawer at this viewport width");
  await clickablePin.click();
  await expect(page.locator("#court-session-sheet")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("open drawer: opening a session detail sheet and closing it restores the drawer and focus to the originating card", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");

  const card = page.locator("[data-testid='session-card']").first();
  await card.focus();
  await card.press("Enter");
  await expect(page.locator("#session-sheet")).toBeVisible();
  // The sheet floats above the persistent drawer — the drawer stays open
  // underneath it (dc:詳情 scrim 蓋在抽屜之上且不關抽屜)。
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");

  await page.keyboard.press("Escape");
  await expect(page.locator("#session-sheet")).toBeHidden();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");
  await expect(card).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("batch 18 quiet discovery refresh preserves drawer scroll after restoring card focus", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { createSessionController } = await window.__importAppModule("sessionController");
    const { COURTS, MOCK_SESSIONS } = await window.__importAppModule("mockData");
    const { renderNearbySessionsDrawer } = await window.__importAppModule("sessionViews");
    document.getElementById("nearby-sessions-drawer")?.remove();
    const root = document.createElement("aside");
    root.id = "batch-18-drawer";
    document.body.appendChild(root);

    const template = MOCK_SESSIONS.find((session) => session.slotsRemaining > 0);
    const sessions = Array.from({ length: 32 }, (_, index) => ({
      ...template,
      sessionId: 18000 + index,
    }));
    const visibilityTarget = new EventTarget();
    Object.defineProperty(visibilityTarget, "visibilityState", { value: "visible" });
    let discoveryLoads = 0;
    const controller = createSessionController({
      api: {
        loadSessionDiscovery: async () => {
          discoveryLoads += 1;
          return sessions;
        },
      },
      discoveryPollIntervalMs: 1_000_000,
      visibilityTarget,
      render: (view) => renderNearbySessionsDrawer(root, { ...view, courts: COURTS }),
    });
    await controller.loadDiscovery();
    controller.setDrawerState("open");
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const scroll = root.querySelector(".nearby-drawer__scroll");
    const focusedCard = root.querySelectorAll("[data-session-id]")[8];
    focusedCard.focus({ preventScroll: true });
    scroll.scrollTop = 200;
    window.__batch18QuietRefresh = () => visibilityTarget.dispatchEvent(new Event("visibilitychange"));
    window.__batch18DiscoveryLoads = () => discoveryLoads;
  });

  expect(await page.evaluate(() => document.querySelector("#batch-18-drawer .nearby-drawer__scroll").scrollTop)).toBe(200);
  await page.evaluate(() => window.__batch18QuietRefresh());
  await expect.poll(() => page.evaluate(() => window.__batch18DiscoveryLoads())).toBe(2);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const result = await page.evaluate(() => ({
    focusedSessionId: document.activeElement?.getAttribute("data-session-id"),
    scrollTop: document.querySelector("#batch-18-drawer .nearby-drawer__scroll").scrollTop,
  }));
  expect(result).toEqual({ focusedSessionId: "18008", scrollTop: 200 });
  expect(runtimeErrors).toEqual([]);
});

test("batch 18 drawer scroll memory covers first render, both v2 states, collapsed redraw, and shorter-list clamping", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const firstRender = await page.evaluate(async () => {
    const { COURTS, MOCK_SESSIONS } = await window.__importAppModule("mockData");
    const { renderNearbySessionsDrawer } = await window.__importAppModule("sessionViews");
    document.getElementById("nearby-sessions-drawer")?.remove();
    const root = document.createElement("aside");
    root.id = "batch-18-state-drawer";
    document.body.appendChild(root);
    const template = MOCK_SESSIONS.find((session) => session.slotsRemaining > 0);
    const sessions = Array.from({ length: 32 }, (_, index) => ({
      ...template,
      sessionId: 18100 + index,
    }));
    const render = (drawerState, nextSessions = sessions) =>
      renderNearbySessionsDrawer(root, { courts: COURTS, drawerState, sessions: nextSessions });

    render("collapsed");
    window.__batch18DrawerState = { render, sessions, template };
    return {
      hidden: root.querySelector("#nearby-sessions-list").hidden,
      scrollTop: root.querySelector(".nearby-drawer__scroll").scrollTop,
      state: root.querySelector("#nearby-sessions-list").dataset.drawerState,
    };
  });
  expect(firstRender).toEqual({ hidden: true, scrollTop: 0, state: "collapsed" });

  await page.evaluate(() => {
    const { render } = window.__batch18DrawerState;
    render("open");
    document.querySelector("#batch-18-state-drawer .nearby-drawer__scroll").scrollTop = 200;
    render("collapsed");
    // This second collapsed render is the falsifiable step: a broken
    // implementation would overwrite the remembered 200 with the hidden
    // replacement element's zero before the drawer is reopened.
    render("collapsed");
    render("open");
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(await page.evaluate(() => document.querySelector("#batch-18-state-drawer .nearby-drawer__scroll").scrollTop)).toBe(200);

  const clamped = await page.evaluate(async () => {
    const { render, template } = window.__batch18DrawerState;
    render("open", [{ ...template, sessionId: 18999 }]);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const scroll = document.querySelector("#batch-18-state-drawer .nearby-drawer__scroll");
    return { maxScrollTop: Math.max(0, scroll.scrollHeight - scroll.clientHeight), scrollTop: scroll.scrollTop };
  });
  expect(clamped.scrollTop).toBe(clamped.maxScrollTop);
  expect(runtimeErrors).toEqual([]);
});

test("swiping the drawer up moves it one segment at a time, and swiping down reverses it one segment at a time", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const drawer = page.locator("#nearby-sessions-drawer");
  const list = page.locator("#nearby-sessions-list");
  await expect(list).toHaveAttribute("data-drawer-state", "collapsed");

  // wireDrawerInteractions binds pointerdown/pointerup directly on #nearby-sessions-drawer
  // and re-binds on every render, so each gesture must wait for the previous
  // one's render to land before firing (the 44px threshold is unchanged).
  const swipe = async (delta) => {
    const start = 300;
    await drawer.dispatchEvent("pointerdown", { clientY: start, pointerId: 1 });
    await drawer.dispatchEvent("pointerup", { clientY: start - delta, pointerId: 1 });
  };

  await swipe(100); // up: collapsed -> open
  await expect(list).toHaveAttribute("data-drawer-state", "open");
  await swipe(100); // up again: v2 只有兩態,維持 open
  await expect(list).toHaveAttribute("data-drawer-state", "open");

  await swipe(-100); // down: open -> collapsed
  await expect(list).toHaveAttribute("data-drawer-state", "collapsed");
  await expect(list).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

test("a top sheet consumes Escape before the underlying nearby drawer", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  const result = await page.evaluate(() => {
    const card = document.querySelector("[data-testid='session-card']");
    card?.focus();
    card?.click();
    const sheetOpened = Boolean(document.querySelector("#session-sheet"));
    card?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    return {
      activeSessionId: document.activeElement?.getAttribute("data-session-id"),
      drawerExpanded: document.querySelector("#nearby-sessions-toggle")?.getAttribute("aria-expanded"),
      sheetOpened,
      sheetPresent: Boolean(document.querySelector("#session-sheet")),
    };
  });

  expect(result).toEqual({
    activeSessionId: "9001",
    drawerExpanded: "true",
    sheetOpened: true,
    sheetPresent: false,
  });
  expect(runtimeErrors).toEqual([]);
});

test("clicking the drawer's collapse handle directly collapses the open drawer", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");

  await page.getByTestId("drawer-collapse").click();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "collapsed");
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "false");
  expect(runtimeErrors).toEqual([]);
});

test("Escape closes an open level popover before it reaches the open drawer beneath it", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");

  await page.locator("#level-chip").click();
  await expect(page.locator("#level-popover")).toBeVisible();
  await expect(page.locator("#level-chip")).toHaveAttribute("aria-expanded", "true");

  // First Escape must only close the popover: the drawer beneath it stays open.
  await page.keyboard.press("Escape");
  await expect(page.locator("#level-popover")).toBeHidden();
  await expect(page.locator("#level-chip")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");

  // With the popover gone, a second Escape now reaches the drawer and collapses it.
  await page.keyboard.press("Escape");
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "collapsed");
  expect(runtimeErrors).toEqual([]);
});

test("a pending join confirmation accepts only one intentional submission", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  // 批 C3-2:join 確認併進同一張 detail sheet,不再開獨立 dialog——直接以
  // initialStage:"confirming" 開 sheet 驗證雙擊只送出一次。
  await page.evaluate(async () => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    let releaseConfirmation;
    window.__joinConfirmationCalls = 0;
    window.__releaseJoinConfirmation = () => releaseConfirmation?.();
    const pendingConfirmation = new Promise((resolve) => {
      releaseConfirmation = resolve;
    });
    openSessionSheet(
      { court: "示範球場", startAt: "2026-07-19T01:00:00.000Z" },
      {
        action: { label: "申請加入", kind: "join", expectedAccepted: false },
        initialStage: "confirming",
        onConfirmJoin: async () => {
          window.__joinConfirmationCalls += 1;
          await pendingConfirmation;
          return { joinSubmitted: true };
        },
      }
    );
  });

  const sheet = page.locator("#session-sheet");
  const confirm = sheet.getByTestId("join-confirm");
  await expect(confirm).toBeVisible();
  await page.evaluate(() => {
    const button = document.querySelector('#session-sheet [data-testid="join-confirm"]');
    button?.click();
    button?.click();
  });
  await expect.poll(() => page.evaluate(() => window.__joinConfirmationCalls)).toBe(1);
  await expect(confirm).toBeDisabled();
  // 批 C3-3(補 Task 2 審查遺留):submitting 態兩鈕皆 disabled,
  // JOIN_STAGE_FOCUSABLE_SELECTOR 排除 disabled 元素找不到目標,焦點 fallback 回
  // 帶 tabindex="-1" 的動作區容器本身(同一個節點也帶 data-join-stage),不落 body。
  await expect(sheet.locator('[data-join-stage="submitting"]')).toBeFocused();
  await page.evaluate(() => window.__releaseJoinConfirmation());
  await expect(sheet.getByTestId("join-success-title")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("withdrawal requires an in-project confirmation that warns the member cannot apply again", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openWithdrawSessionConfirmation } = await window.__importAppModule("sessionViews");
    let releaseWithdrawal;
    window.__withdrawConfirmationCalls = 0;
    window.__releaseWithdrawal = () => releaseWithdrawal?.();
    const pendingWithdrawal = new Promise((resolve) => {
      releaseWithdrawal = resolve;
    });
    openWithdrawSessionConfirmation({
      onConfirm: async () => {
        window.__withdrawConfirmationCalls += 1;
        await pendingWithdrawal;
      },
    });
  });

  const confirmation = page.getByRole("dialog", { name: "確認退出這一局？" });
  await expect(confirmation).toContainText("退出後將無法再次申請這一局。");
  const confirm = confirmation.getByRole("button", { name: "確認退出" });
  await page.evaluate(() => {
    const button = document.querySelector("[data-confirm-withdraw]");
    button?.click();
    button?.click();
  });
  await expect.poll(() => page.evaluate(() => window.__withdrawConfirmationCalls)).toBe(1);
  await expect(confirm).toBeDisabled();
  await page.evaluate(() => window.__releaseWithdrawal());
  await expect(confirmation).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

test("cancelling chat withdrawal keeps the action enabled and allows reopening confirmation", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openSessionChatSheet, openWithdrawSessionConfirmation } = await window.__importAppModule("sessionViews");
    window.__chatWithdrawConfirmationCount = 0;
    openSessionChatSheet(
      {
        court: "示範球場",
        courtDistrict: "大安區",
        playType: "雙打",
        sessionId: 8102,
        slotsRemaining: 0,
        startAt: "2026-08-03T10:00:00+08:00",
        status: "open",
      },
      {
        canWithdraw: true,
        onWithdraw: () => {
          window.__chatWithdrawConfirmationCount += 1;
          return openWithdrawSessionConfirmation();
        },
      }
    );
  });

  const chat = page.getByTestId("session-chat-sheet");
  const withdraw = chat.getByRole("button", { name: "取消參加" });
  await withdraw.click();
  const confirmation = page.getByRole("dialog", { name: "確認退出這一局？" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "先不要" }).click();
  await expect(confirmation).toBeHidden();
  await expect(withdraw).toBeEnabled();
  await withdraw.click();
  await expect(confirmation).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__chatWithdrawConfirmationCount)).toBe(2);
  expect(runtimeErrors).toEqual([]);
});

test("cancelling My Sessions withdrawal keeps the action enabled and allows reopening confirmation", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openWithdrawSessionConfirmation, renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    window.__mySessionWithdrawConfirmationCount = 0;
    renderMySessionsPage(root, {
      authenticated: true,
      groups: {
        history: [],
        needsAction: [],
        needsActionCount: 0,
        upcoming: [
          {
            canWithdraw: true,
            court: "青年公園網球場",
            courtDistrict: "萬華區",
            hostNickname: "主揪",
            playType: "雙打",
            sessionId: 8103,
            slotsRemaining: 0,
            startAt: "2099-08-03T10:00:00+08:00",
            status: "open",
            viewerParticipantStatus: "accepted",
            viewerRole: "guest",
          },
        ],
      },
      onWithdraw: () => {
        window.__mySessionWithdrawConfirmationCount += 1;
        return openWithdrawSessionConfirmation();
      },
    });
  });

  const withdraw = page.locator("[data-my-action='withdraw'][data-session-id='8103']");
  await withdraw.click();
  const confirmation = page.getByRole("dialog", { name: "確認退出這一局？" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "先不要" }).click();
  await expect(confirmation).toBeHidden();
  await expect(withdraw).toBeEnabled();
  await withdraw.click();
  await expect(confirmation).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__mySessionWithdrawConfirmationCount)).toBe(2);
  expect(runtimeErrors).toEqual([]);
});

test("join confirmation shares the sheet's own summary (no repeat) and becomes an in-place success state", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  // 批 C3-2:join 確認併進同一張 detail sheet,不再重複渲染球局摘要——detail 上方
  // 欄位只出現一次,confirming 態只加差異提示(join 型式)。
  await page.evaluate(async () => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    openSessionSheet(
      {
        court: "青年公園網球場",
        courtDistrict: "萬華區",
        hostNickname: "公開主揪",
        hostNtrp: 3.5,
        hostProfileComplete: true,
        notes: "自備新球",
        ntrpMax: 4,
        ntrpMin: 3,
        playType: "單打",
        sessionId: 9402,
        slotsRemaining: 1,
        startAt: "2026-07-19T01:00:00.000Z",
      },
      {
        action: { label: "申請加入", kind: "join", expectedAccepted: false },
        initialStage: "confirming",
        onConfirmJoin: async () => ({ joinSubmitted: true }),
        // 批 C3-3:CTA 現在把 session.sessionId 交回呼叫端(main.js 用它聚焦 My
        // Sessions 新參與卡),這裡記錄實際收到的參數值,不只是呼叫次數。
        onViewMySessions: (sessionId) => {
          window.__joinSuccessDestinationCalls = (window.__joinSuccessDestinationCalls ?? 0) + 1;
          window.__joinSuccessDestinationArgs = (window.__joinSuccessDestinationArgs ?? []).concat([sessionId]);
        },
      }
    );
  });

  const sheet = page.locator("#session-sheet");
  await expect(sheet.locator('[data-join-stage="confirming"]')).toBeVisible();
  await expect(sheet.getByTestId("join-confirm")).toBeVisible();
  await expect(sheet.getByTestId("join-cancel")).toBeVisible();
  // 摘要只在 detail 本體出現一次,confirming 不重複渲染。
  // 批 D4b:v2 頭部把球場名(19px)與行政區・時間拆成兩行、記分板條拆成三格
  // 獨立 cell,原本用 " · " 串接的單一長字串斷成分項比對。
  await expect(sheet.locator(".session-detail__court")).toHaveText("青年公園網球場");
  await expect(sheet.locator('[data-session-field="time"]')).toContainText("萬華區");
  await expect(sheet.locator('[data-session-field="details"]')).toContainText("單打");
  // 批 D9 backlog #1:記分板格眉已是「NTRP」,格值改剝掉重複前綴(390px 下原本
  // 折兩行),只在這一格斷言裸範圍;ntrpRange() 本體與其他呼叫點(如下方 host-row
  // 的 formatNtrp())文案不動。用 :has() 鎖定 NTRP 那一格的 value(而不是對整個
  // details 容器 not.toContainText("NTRP 3.0"))——details 容器裡格眉本來就會印出
  // 字面「NTRP」,跟後面的格值文字節點相鄰,Playwright 正規化空白後兩者仍會被
  // 串成「NTRP 3.0…」,對容器整體斷言「不含」永遠假紅,量測目標必須精確到格值本身。
  const ntrpCellValue = sheet
    .locator(".scoreboard-strip__cell", { has: page.locator(".scoreboard-strip__eyebrow", { hasText: "NTRP" }) })
    .locator(".scoreboard-strip__value");
  await expect(ntrpCellValue).toHaveText("3.0–4.0");
  await expect(sheet.locator(".scoreboard-strip__cell--inverse")).toContainText("1 位");
  await expect(sheet.locator(".host-row")).toContainText("公開主揪");
  await expect(sheet.locator(".host-row__chip")).toHaveText("主揪");
  await expect(sheet.locator(".host-row__ntrp")).toHaveText("NTRP 3.5 · 資料完整");
  await expect(sheet).toContainText("自備新球");
  await expect(sheet.locator('[data-session-field="court"]')).toHaveCount(1);
  await sheet.getByTestId("join-confirm").click();
  await expect(sheet.locator('[data-join-stage="success"]')).toBeVisible();
  await expect(sheet.getByTestId("join-cancel")).toHaveCount(0);
  await expect(sheet).toContainText("已送出申請，等待主揪回覆。");
  const successTitle = sheet.getByTestId("join-success-title");
  await expect(successTitle).toBeFocused();
  const mySessionsCta = sheet.getByTestId("join-open-my-sessions");
  await mySessionsCta.click();
  await expect(sheet).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__joinSuccessDestinationCalls)).toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.__joinSuccessDestinationArgs))
    .toEqual([9402]);
  expect(runtimeErrors).toEqual([]);
});

test("an accepted joined session focuses its own upcoming card without the create-session copy", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  // 批 C3-3:createdSessionId 拆參——highlightSessionId 純做卡片聚焦比對(create／
  // join 兩種來源都可傳),createdSessionId 只在真正的 create 流程才傳,才會觸發
  // 「球局已建立」文案與 create 專屬推播 prompt。這裡模擬 main.js 的 join CTA 接線
  // (reason:"joined" → 只傳 highlightSessionId,不傳 createdSessionId)。
  const acceptedSession = {
    court: "青年公園網球場",
    courtDistrict: "萬華區",
    hostNickname: "主揪",
    playType: "雙打",
    sessionId: 9501,
    slotsRemaining: 0,
    startAt: "2099-08-03T10:00:00+08:00",
    status: "open",
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  };

  await page.evaluate(async (session) => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    renderMySessionsPage(document.getElementById("my-sessions-root"), {
      authenticated: true,
      groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [session] },
      highlightSessionId: session.sessionId,
    });
  }, acceptedSession);

  const root = page.locator("#my-sessions-root");
  await expect(root).not.toContainText("球局已建立");
  await expect(root).toContainText("依目前需要處理的事項與球局時間排序。");
  await expect(root.getByTestId("created-session-enable-push")).toHaveCount(0);
  const openButton = page.locator(
    `#my-upcoming-sessions [data-open-my-session][data-session-id='${acceptedSession.sessionId}']`
  );
  await expect(openButton).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("a pending guest request focuses its own withdraw button, not the page heading, without the create-session copy", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  // 批 C3-3 意外(不在 ground truth 內,實作時發現):approval／NTRP 缺／NTRP 範圍外
  // 三種 outcome 送出後,session 落在 needsAction 的 guest-request(不是 upcoming),
  // 舊聚焦骨架只查 upcoming——若不擴充,這三種 outcome 點 CTA 後焦點會直接掉回
  // body。guestRequestCard 現在也接受 highlightSessionId,聚焦其唯一的可操作元素
  // (撤回申請鈕)。
  const pendingSession = {
    court: "大安運動中心",
    courtDistrict: "大安區",
    hostNickname: "主揪",
    playType: "單打",
    sessionId: 9502,
    startAt: "2099-08-03T10:00:00+08:00",
    status: "open",
  };

  await page.evaluate(async (session) => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    renderMySessionsPage(document.getElementById("my-sessions-root"), {
      authenticated: true,
      groups: {
        history: [],
        needsAction: [{ kind: "guest-request", session }],
        needsActionCount: 1,
        upcoming: [],
      },
      highlightSessionId: session.sessionId,
    });
  }, pendingSession);

  const root = page.locator("#my-sessions-root");
  await expect(root).not.toContainText("球局已建立");
  await expect(page.locator("#my-sessions-root [data-my-sessions-heading]")).not.toBeFocused();
  const withdrawButton = page.locator(
    `[data-guest-request-session='${pendingSession.sessionId}'] [data-my-action='withdraw']`
  );
  await expect(withdrawButton).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("join and create success moments offer push only when the device can enable it", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  const session = {
    court: "青年公園網球場",
    courtDistrict: "萬華區",
    hostNickname: "公開主揪",
    hostNtrp: 3.5,
    hostProfileComplete: true,
    ntrpMax: 4,
    ntrpMin: 3,
    playType: "單打",
    sessionId: 8811,
    slotsRemaining: 1,
    startAt: "2099-07-19T01:00:00.000Z",
    status: "open",
    viewerParticipantStatus: "accepted",
    viewerRole: "host",
  };

  // 批 C3-2:join 成功卡併進同一張 detail sheet,不再開獨立 dialog——直接以
  // initialStage:"confirming" 開 sheet,點 join-confirm 進成功態。
  await page.evaluate(async (sessionInput) => {
    const { openSessionSheet, renderMySessionsPage } = await window.__importAppModule("sessionViews");
    window.__successPushCalls = [];
    openSessionSheet(sessionInput, {
      action: { label: "申請加入", kind: "join", expectedAccepted: false },
      initialStage: "confirming",
      notificationSettings: { pushStatus: "idle", webPushConfigured: true },
      onConfirmJoin: async () => ({ joinSubmitted: true }),
      onEnablePush: async () => {
        window.__successPushCalls.push("join");
        return "enabled";
      },
    });
    window.__renderCreatedPush = (settings) => {
      document.getElementById("my-sessions-page").hidden = false;
      renderMySessionsPage(document.getElementById("my-sessions-root"), {
        authenticated: true,
        createdSessionId: sessionInput.sessionId,
        groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [sessionInput] },
        notificationSettings: settings,
        onEnablePush: async () => {
          window.__successPushCalls.push("create");
          return "enabled";
        },
      });
    };
  }, session);

  const confirmation = page.locator("#session-sheet");
  await confirmation.getByTestId("join-confirm").click();
  const joinPush = confirmation.getByTestId("join-success-enable-push");
  await expect(joinPush).toBeVisible();
  await expect(confirmation).toContainText("加入主畫面");
  await joinPush.click();
  await expect(joinPush).toBeHidden();
  await page.keyboard.press("Escape");

  await page.evaluate(() => window.__renderCreatedPush({ pushStatus: "idle", webPushConfigured: true }));
  await expect(page.getByTestId("created-session-enable-push")).toBeVisible();
  await page.getByTestId("created-session-enable-push").click();
  await expect.poll(() => page.evaluate(() => window.__successPushCalls)).toEqual(["join", "create"]);

  for (const settings of [
    { pushStatus: "enabled", webPushConfigured: true },
    { pushStatus: "unsupported", webPushConfigured: true },
    { pushStatus: "idle", webPushConfigured: false },
  ]) {
    await page.evaluate((nextSettings) => window.__renderCreatedPush(nextSettings), settings);
    await expect(page.getByTestId("created-session-enable-push")).toHaveCount(0);
  }

  await page.keyboard.press("Escape");
  for (const settings of [
    { pushStatus: "enabled", webPushConfigured: true },
    { pushStatus: "unsupported", webPushConfigured: true },
  ]) {
    await page.evaluate(
      async ({ sessionInput, settings: nextSettings }) => {
        const { openSessionSheet } = await window.__importAppModule("sessionViews");
        openSessionSheet(sessionInput, {
          action: { label: "申請加入", kind: "join", expectedAccepted: false },
          initialStage: "confirming",
          notificationSettings: nextSettings,
          onConfirmJoin: async () => ({ joinSubmitted: true }),
        });
      },
      { sessionInput: session, settings }
    );
    const nextConfirmation = page.locator("#session-sheet");
    await nextConfirmation.getByTestId("join-confirm").click();
    await expect(nextConfirmation.getByTestId("join-success-enable-push")).toHaveCount(0);
    await page.keyboard.press("Escape");
  }

  await page.evaluate(async (sessionInput) => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    openSessionSheet(sessionInput, {
      action: { label: "申請加入", kind: "join", expectedAccepted: false },
      initialStage: "confirming",
      notificationSettings: { pushStatus: "idle", webPushConfigured: true },
      onConfirmJoin: async () => ({ joinSubmitted: true }),
      onEnablePush: async () => "unsupported",
    });
  }, session);
  const unsupportedConfirmation = page.locator("#session-sheet");
  await unsupportedConfirmation.getByTestId("join-confirm").click();
  const unsupportedPush = unsupportedConfirmation.getByTestId("join-success-enable-push");
  await unsupportedPush.click();
  await expect(unsupportedPush).toBeDisabled();
  await expect(unsupportedConfirmation).toContainText("此瀏覽器不支援 Web Push");
  expect(runtimeErrors).toEqual([]);
});

test("authenticated pre-join roster renders host first with escaped names, NTRP fallback, and avatar fallback", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  // 批 C3-2:join preview 只在 detail sheet 出現一次(idle 態就已 hydrate,
  // confirming 沿用同一份),不再有獨立 confirmation surface 各自渲染一次。
  await page.evaluate(async () => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    const session = {
      court: "青年公園網球場",
      courtDistrict: "萬華區",
      hostNickname: "公開主揪",
      hostNtrp: 3.5,
      hostProfileComplete: true,
      notes: "安全名單測試",
      ntrpMax: 4,
      ntrpMin: 3,
      playType: "單打",
      sessionId: 881,
      slotsRemaining: 1,
      startAt: "2099-07-19T01:00:00.000Z",
    };
    const participants = [
      { avatarUrl: "", hostedPlayedCount: 0, nickname: "<img src=x onerror=alert(1)>", ntrp: null, role: "guest", sessionId: 881 },
      {
        avatarUrl: "https://lh3.googleusercontent.com/a/stage-t45-host",
        hostedPlayedCount: 3,
        nickname: "名單主揪",
        ntrp: 3.5,
        role: "host",
        sessionId: 881,
      },
    ];
    const detail = openSessionSheet(session, { action: { label: "申請加入" }, showJoinPreview: true });
    detail.setJoinPreview({ participants, status: "ready" });
  });

  const preview = page.locator("#session-sheet [data-session-join-preview]");
  await expect(preview).toContainText("已確認參加者");
  await expect(preview.locator("[data-join-preview-person]").first()).toContainText("主揪");
  await expect(preview.locator("[data-join-preview-person]").nth(1)).toContainText("尚未填寫 NTRP");
  await expect(preview).toContainText("<img src=x onerror=alert(1)>");
  await expect(preview.locator("img[src='x']")).toHaveCount(0);
  // 中性聚合數:主揪的 3 顯示、guest 的 0 整行不畫,所以整份名單只有一個 .trust-count。
  await expect(preview.locator(".trust-count")).toHaveCount(1);
  // D5:替代字母只是裝飾,暱稱就在旁邊;與 alt="" 的 img 一致不重複朗讀。
  await expect(preview.locator("[data-avatar-fallback]").first()).toHaveAttribute("aria-hidden", "true");
  await expect(preview.locator("[data-join-preview-person]").first().locator(".trust-count")).toHaveText("已成局 3 次");

  const hostImage = preview.locator("[data-join-preview-person]").first().locator("img");
  await expect(hostImage).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/stage-t45-host");
  await hostImage.dispatchEvent("error");
  await expect(preview.locator("[data-join-preview-person]").first().locator("[data-avatar-fallback]")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("profile completion previews the current Google avatar and explains that it cannot be customized", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
    openProfileCompletionSheet({
      avatarUrl: "https://lh5.googleusercontent.com/a/stage-t45-self",
      profile: { courts: new Set(), nick: "本人", ntrp: null, slots: new Set(), types: new Set() },
    });
  });

  const sheet = page.locator("#profile-completion-sheet");
  await expect(sheet.getByText("使用 Google 頭像，無法自訂")).toBeVisible();
  const avatar = sheet.locator("[data-profile-avatar] img");
  await expect(avatar).toHaveAttribute("src", "https://lh5.googleusercontent.com/a/stage-t45-self");
  await avatar.dispatchEvent("error");
  await expect(sheet.locator("[data-profile-avatar] [data-avatar-fallback]")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("an expected instant outcome explains group chat and shows accepted success", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  // 批 C3-2:instant join 也走兩段確認(spec 假設 4),同一張 detail sheet 內嵌
  // confirming/success,不再開獨立的「直接加入這場球局？」dialog。
  await page.evaluate(async () => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    openSessionSheet(
      {
        court: "大佳河濱公園網球場",
        courtDistrict: "中山區",
        hostNickname: "公開主揪",
        hostNtrp: 3.5,
        hostProfileComplete: true,
        joinMode: "instant",
        notes: "友善雙打輪轉",
        ntrpMax: 4.5,
        ntrpMin: 3,
        playType: "雙打",
        sessionId: 9403,
        slotsRemaining: 2,
        startAt: "2026-07-19T01:00:00.000Z",
      },
      {
        action: { label: "直接加入", kind: "join", expectedAccepted: true },
        initialStage: "confirming",
        onConfirmJoin: async () => ({ accepted: true, joinSubmitted: true }),
        onViewMySessions: () => {
          window.__instantJoinSuccessDestinationCalls = (window.__instantJoinSuccessDestinationCalls ?? 0) + 1;
        },
      }
    );
  });

  const confirmation = page.locator("#session-sheet");
  await expect(confirmation).toContainText("加入後即可在球局群組聊天協調細節。");
  await confirmation.getByTestId("join-confirm").click();
  await expect(confirmation).toContainText("已加入球局！前往我的球局開啟群組聊天。");
  const successTitle = confirmation.getByTestId("join-success-title");
  await expect(successTitle).toBeFocused();
  const mySessionsCta = confirmation.getByTestId("join-open-my-sessions");
  await mySessionsCta.click();
  await expect(confirmation).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__instantJoinSuccessDestinationCalls)).toBe(1);
  expect(runtimeErrors).toEqual([]);
});

test("a host viewing their own accepted session sees no withdraw affordance, unlike an accepted guest", async ({ page }) => {
  // fix round 1(驗收回歸):actionFor 的 kind:"chat" 分支同時涵蓋主揪(host)與
  // accepted guest——兩者的 viewerParticipantStatus 都是 accepted。但
  // can_withdraw / withdraw_from_session 是 guest-only
  // (202607210002_session_join_mode.sql),主揪按「取消報名」會被 RPC 拒絕;改版前
  // 主揪在詳情 sheet 本來就沒有 withdraw 入口。這裡用同一個 session/action 對照
  // isMine true/false 兩種視角:host 視角兩者都不存在,guest 視角兩者都存在
  // ——對稱 control group,證明「不存在」的斷言不是空集合掃描。
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  const session = {
    court: "青年公園網球場",
    courtDistrict: "萬華區",
    hostNickname: "示範松果",
    hostNtrp: 3.5,
    hostProfileComplete: true,
    joinMode: "approval",
    notes: "",
    ntrpMax: 4,
    ntrpMin: 3,
    playType: "單打",
    sessionId: 9601,
    slotsRemaining: 1,
    startAt: "2099-07-19T01:00:00.000Z",
  };

  await page.evaluate(async (sessionInput) => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    openSessionSheet(sessionInput, { action: { label: "群組聊天", kind: "chat" }, isMine: true });
  }, session);
  const hostSheet = page.locator("#session-sheet");
  await expect(hostSheet.getByRole("button", { name: "群組聊天" })).toBeVisible();
  await expect(hostSheet.getByText("已加入這場球局")).toHaveCount(0);
  await expect(hostSheet.getByRole("button", { name: "取消報名" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.evaluate(async (sessionInput) => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    openSessionSheet(sessionInput, { action: { label: "群組聊天", kind: "chat" }, isMine: false });
  }, session);
  const guestSheet = page.locator("#session-sheet");
  await expect(guestSheet.getByRole("button", { name: "群組聊天" })).toBeVisible();
  await expect(guestSheet.getByText("已加入這場球局")).toBeVisible();
  await expect(guestSheet.getByRole("button", { name: "取消報名" })).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test("join confirmation distinguishes both requested NTRP outcomes without losing success focus", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  for (const [outcome, message] of [
    ["OK_NTRP_MISSING", "已送出申請；你尚未填寫 NTRP，等待主揪回覆。"],
    ["OK_NTRP_OUT_OF_RANGE", "已送出申請；你的 NTRP 不在球局設定範圍內，等待主揪回覆。"],
  ]) {
    await page.evaluate(async (nextOutcome) => {
      const { openSessionSheet } = await window.__importAppModule("sessionViews");
      openSessionSheet(
        {
          court: "示範球場",
          courtDistrict: "大安區",
          hostNickname: "公開主揪",
          hostNtrp: 3.5,
          hostProfileComplete: true,
          joinMode: "instant",
          ntrpMax: 4,
          ntrpMin: 3,
          playType: "單打",
          sessionId: 9404,
          slotsRemaining: 1,
          startAt: "2099-07-19T01:00:00.000Z",
        },
        {
          action: { label: "申請加入", kind: "join", expectedAccepted: false },
          initialStage: "confirming",
          onConfirmJoin: async () => ({ accepted: false, joinSubmitted: true, outcome: nextOutcome }),
        }
      );
    }, outcome);

    const confirmation = page.locator("#session-sheet");
    await expect(confirmation.getByTestId("join-confirm")).toBeVisible();
    await expect(confirmation.getByTestId("join-cancel")).toBeVisible();
    await confirmation.getByTestId("join-confirm").click();
    await expect(confirmation.getByText(message)).toBeVisible();
    await expect(confirmation.getByTestId("join-success-title")).toBeFocused();
    await page.keyboard.press("Escape");
  }
  expect(runtimeErrors).toEqual([]);
});

test("candidate session cards and details resolve every court until Boolean decidedAt becomes true", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const candidateSession = {
    candidateCourtIds: [8, 9, 10],
    court: "示範球場",
    courtDistrict: "大安區",
    decidedAt: "",
    feeNote: "每人 150 元",
    hostNickname: "公開主揪",
    hostNtrp: 3.5,
    hostProfileComplete: true,
    joinMode: "approval",
    ntrpMax: 4,
    ntrpMin: 3,
    notes: "候選局測試",
    playType: "雙打",
    rangeEnd: "2099-07-19T05:00:00.000Z",
    sessionId: 8801,
    slotsRemaining: 2,
    startAt: "2099-07-19T01:00:00.000Z",
    status: "open",
    venueType: "candidates",
  };
  const courts = [
    { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
    { city: "台北市", district: "中山區", id: 9, name: "第二球場" },
    { city: "台北市", district: "萬華區", id: 10, name: "第三球場" },
  ];
  await page.evaluate(
    async ({ candidateSession: session, courts: catalogue }) => {
      const { openSessionSheet, renderNearbySessionsDrawer } = await window.__importAppModule("sessionViews");
      renderNearbySessionsDrawer(document.getElementById("nearby-sessions-drawer"), {
        courts: catalogue,
        drawerState: "open",
        sessions: [session],
      });
      openSessionSheet(session, { action: { label: "申請加入" }, courts: catalogue });
    },
    { candidateSession, courts }
  );

  const card = page.getByTestId("session-card");
  const detail = page.locator("#session-sheet");
  // 批 D2:v2 卡片以「首館 等 N 館候選」表達候選場次(dc L846),完整候選清單只在詳情。
  await expect(card).toContainText("示範球場 等 3 館候選");
  await expect(card).toContainText("每人 150 元");
  await expect(card).not.toContainText("已定案");
  await expect(detail).toContainText("候選局");
  await expect(detail).toContainText("示範球場、第二球場、第三球場");
  await expect(detail).toContainText("每人 150 元");
  await expect(detail).not.toContainText("已定案");
  await page.keyboard.press("Escape");

  await page.evaluate(
    async ({ candidateSession: session, courts: catalogue }) => {
      const { openSessionSheet } = await window.__importAppModule("sessionViews");
      openSessionSheet(
        {
          ...session,
          court: "第三球場",
          courtDistrict: "萬華區",
          decidedAt: "2099-07-18T08:00:00.000Z",
          startAt: "2099-07-19T03:00:00.000Z",
        },
        { action: { label: "申請加入" }, courts: catalogue }
      );
    },
    { candidateSession, courts }
  );
  const decided = page.locator("#session-sheet");
  // 批 D4b:v2 頭部把球場名與行政區拆成兩行,不再是同一個 " · " 字串。
  await expect(decided).toContainText("第三球場");
  await expect(decided).toContainText("萬華區");
  await expect(decided).toContainText("已定案");
  await expect(decided).not.toContainText("第二球場");
  expect(runtimeErrors).toEqual([]);
});

test("undecided candidate sessions keep their court list and time range across private surfaces", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  const candidateSession = {
    canWithdraw: true,
    candidateCourtIds: [8, 9, 10],
    court: "示範球場",
    courtDistrict: "大安區",
    decidedAt: null,
    hostNickname: "公開主揪",
    hostNtrp: 3.5,
    hostProfileComplete: true,
    ntrpMax: 4,
    ntrpMin: 3,
    notes: "候選局測試",
    playType: "雙打",
    rangeEnd: "2099-07-19T05:00:00.000Z",
    sessionId: 8802,
    slotsRemaining: 2,
    startAt: "2099-07-19T01:00:00.000Z",
    status: "open",
    venueType: "candidates",
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  };
  const courts = [
    { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
    { city: "台北市", district: "中山區", id: 9, name: "第二球場" },
    { city: "台北市", district: "萬華區", id: 10, name: "第三球場" },
  ];
  await page.evaluate(
    async ({ candidateSession: session, courts: catalogue }) => {
      const { openSessionChatSheet, renderMySessionsPage } = await window.__importAppModule("sessionViews");
      const root = document.getElementById("my-sessions-root");
      document.getElementById("tab-map").hidden = true;
      document.getElementById("my-sessions-page").hidden = false;
      renderMySessionsPage(root, {
        authenticated: true,
        courts: catalogue,
        groups: {
          history: [],
          needsAction: [
            {
              kind: "host-request",
              participant: { nickname: "申請球友", participantId: 201, profileId: 301, role: "guest", status: "requested" },
              session,
            },
            { kind: "invite", session },
            { kind: "guest-request", session },
          ],
          needsActionCount: 3,
          upcoming: [session],
        },
      });
      openSessionChatSheet(session, { courts: catalogue });
    },
    { candidateSession, courts }
  );

  // 批 D6:My Sessions 薄卡列改用跟地圖抽屜卡(sessionCard)同一套候選局縮寫
  // 「首館 等 N 館候選」+時間磚小時範圍(dc §3 逐字),不再是「完整候選清單 ·
  // 至 HH:MM」的長字串——那個格式只留在不受本批影響的詳情/聊天 sheet。
  // needsAction 的 host-request 卡只在「我主揪的」分頁,其餘三個(upcoming/
  // invite-row/guest-request)在預設的「我報名的」分頁,故先驗後者、再切分頁驗前者。
  const joinedSurfaces = [
    page.locator("#my-upcoming-sessions .my-session-card"),
    page.getByTestId("invite-row"),
    page.locator("[data-guest-request-session='8802']"),
  ];
  for (const surface of joinedSurfaces) {
    const text = await surface.innerText();
    expect.soft(text).toContain("示範球場 等 3 館候選");
    expect.soft(text).not.toContain("第二球場");
    expect.soft(text).toContain("9–13");
  }

  const chatText = await page.locator("#session-chat-sheet [aria-label='球局資訊']").innerText();
  expect.soft(chatText).toContain("候選局");
  expect.soft(chatText).toContain("示範球場、第二球場、第三球場");
  expect.soft(chatText).toContain("至");
  expect.soft(chatText).toContain("13:00");
  // fix round 1(實測):chat sheet 是 modal(aria-modal + backdrop),沒關掉之前點
  // segmented 分頁鈕會被 backdrop 攔截(locator.click 30s timeout,error context
  // 指名 #session-chat-sheet/.surface-backdrop intercepts pointer events)——關掉
  // 之後才切分頁去驗 hosted-only 的 participant-row。
  await page.keyboard.press("Escape");
  await page.getByTestId("my-sessions-seg-hosted").click();
  const hostedText = await page.getByTestId("participant-row").innerText();
  expect.soft(hostedText).toContain("示範球場 等 3 館候選");
  expect.soft(hostedText).not.toContain("第二球場");
  expect.soft(hostedText).toContain("9–13");

  // 批 C3-2:候選局說明文字只在 detail 本體(不受 join 狀態機影響的區塊)出現一次,
  // 不再有獨立 confirmation surface 各自渲染一份。
  await page.evaluate(
    async ({ candidateSession: session, courts: catalogue }) => {
      const { openSessionSheet } = await window.__importAppModule("sessionViews");
      openSessionSheet(session, { action: { label: "申請加入" }, courts: catalogue });
    },
    { candidateSession, courts }
  );
  // 批 D9 backlog #2:未定案候選局的詳情頭部球場名改用跟 D2 卡片同款
  // sessionCourtLabel()「首館 等 N 館候選」縮寫,不再重複下方候選資訊列的完整清單。
  await expect(page.locator("#session-sheet .session-detail__court")).toHaveText("示範球場 等 3 館候選");
  // 批 D4b:候選資訊列文案改採 dc 版本(「候選球場:X、Y · 主揪定案後群組通知」),
  // 取代退役的 candidateDecisionExplanation()。
  await expect(page.locator("#session-sheet [data-session-candidate-explanation]")).toContainText(
    "候選球場:示範球場、第二球場、第三球場 · 主揪定案後群組通知"
  );
  await page.keyboard.press("Escape");
  await page.evaluate(
    async ({ candidateSession: session, courts: catalogue }) => {
      const { openPlayerCardSheet } = await window.__importAppModule("sessionViews");
      openPlayerCardSheet(
        { courtDistrict: "中山區", courtName: "第二球場", isSelf: false, nickname: "可邀請球友", ntrp: 3.5, profileId: 991 },
        { courts: catalogue, myInvitableSessions: [session] }
      );
    },
    { candidateSession, courts }
  );
  await expect(page.locator("#player-card-sheet [data-player-invite-options]")).toContainText("第二球場");
  await expect(page.locator("#player-card-sheet [data-player-invite-options]")).toContainText("至");
  expect(runtimeErrors).toEqual([]);
});

test("decided candidate sessions stay collapsed to one authoritative court and time on private surfaces", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  const decidedSession = {
    candidateCourtIds: [8, 9, 10],
    court: "第三球場",
    courtDistrict: "萬華區",
    decidedAt: "2099-07-18T08:00:00.000Z",
    hostNickname: "公開主揪",
    hostNtrp: 3.5,
    hostProfileComplete: true,
    ntrpMax: 4,
    ntrpMin: 3,
    playType: "雙打",
    rangeEnd: "2099-07-19T05:00:00.000Z",
    sessionId: 8803,
    slotsRemaining: 2,
    startAt: "2099-07-19T03:00:00.000Z",
    status: "open",
    venueType: "candidates",
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  };
  const courts = [
    { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
    { city: "台北市", district: "中山區", id: 9, name: "第二球場" },
    { city: "台北市", district: "萬華區", id: 10, name: "第三球場" },
  ];
  await page.evaluate(
    async ({ decidedSession: session, courts: catalogue }) => {
      const { openSessionChatSheet, renderMySessionsPage } = await window.__importAppModule("sessionViews");
      const root = document.getElementById("my-sessions-root");
      document.getElementById("tab-map").hidden = true;
      document.getElementById("my-sessions-page").hidden = false;
      renderMySessionsPage(root, {
        authenticated: true,
        courts: catalogue,
        groups: {
          history: [],
          needsAction: [{ kind: "invite", session }],
          needsActionCount: 1,
          upcoming: [session],
        },
      });
      openSessionChatSheet(session, { courts: catalogue });
    },
    { decidedSession, courts }
  );

  // 批 D6:My Sessions 薄卡列的球場名沿用 sessionCourtLabel(session?.court 優先於
  // venue.court),已定案候選局因此只顯示球場名、不附行政區,也不掛「候選局 ·
  // 已定案」badge——那些欄位（venue.badge/行政區）只留在不受本批影響的詳情/
  // 聊天 sheet(仍用完整 venue.court)。兩者都在預設的「我報名的」分頁,不需切分頁。
  const decidedSurfaces = [page.locator("#my-upcoming-sessions .my-session-card"), page.getByTestId("invite-row")];
  for (const surface of decidedSurfaces) {
    const text = await surface.innerText();
    expect.soft(text).toContain("第三球場");
    expect.soft(text).toContain("11:00");
    expect.soft(text).not.toContain("第二球場");
    expect.soft(text).not.toContain("至");
    expect.soft(text).not.toContain("已定案");
  }

  const chatText = await page.locator("#session-chat-sheet [aria-label='球局資訊']").innerText();
  expect.soft(chatText).toContain("候選局 · 已定案");
  expect.soft(chatText).toContain("第三球場 · 萬華區");
  expect.soft(chatText).toContain("11:00");
  expect.soft(chatText).not.toContain("第二球場");
  expect.soft(chatText).not.toContain("至");
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions preserves the initiating action and its error across a private-page rerender", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    const session = {
      canCancel: true,
      court: "青年公園網球場",
      courtDistrict: "萬華區",
      hostNickname: "公開主揪",
      hostNtrp: 3.5,
      hostProfileComplete: true,
      ntrpMax: 4,
      ntrpMin: 3,
      playType: "單打",
      sessionId: 731,
      slotsRemaining: 1,
      startAt: "2099-07-19T01:00:00.000Z",
      status: "open",
      viewerParticipantStatus: "accepted",
      viewerRole: "host",
    };
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const render = () =>
      renderMySessionsPage(root, {
        authenticated: true,
        groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [session] },
        onCancel: async () => {
          window.__mySessionActionCalls = (window.__mySessionActionCalls ?? 0) + 1;
          await pending;
          throw new Error("球局狀態暫時無法重新載入，請重新整理後再試。");
        },
      });
    window.__rerenderMySessions = render;
    window.__releaseMySessionAction = release;
    render();
  });

  // 批 D6:viewerRole host 的 upcoming 卡只在「我主揪的」分頁,預設分頁是「我報名的」。
  await page.getByTestId("my-sessions-seg-hosted").click();
  const cancel = page.locator("[data-my-action='cancel']");
  await cancel.click();
  await expect.poll(() => page.evaluate(() => window.__mySessionActionCalls)).toBe(1);
  await page.evaluate(() => window.__rerenderMySessions());
  await expect(cancel).toBeDisabled();
  await page.evaluate(() => window.__releaseMySessionAction());
  await expect(page.locator("#my-sessions-root [data-my-sessions-error]")).toContainText("球局狀態暫時無法重新載入");
  await expect(cancel).toBeEnabled();
  await expect(cancel).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions renders an escaped invite card with stable response testids", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    const payload = '\"><img data-injected="invite-xss" src=x onerror="console.error(\'invite-xss\')">';
    const session = {
      canRespondInvite: true,
      court: payload,
      hostNickname: payload,
      hostNtrp: payload,
      notes: payload,
      playType: payload,
      sessionId: payload,
      slotsRemaining: payload,
      startAt: payload,
      status: "open",
      viewerParticipantStatus: "invited",
      viewerRole: "guest",
    };
    renderMySessionsPage(root, {
      authenticated: true,
      groups: { history: [], needsAction: [{ kind: "invite", session }], needsActionCount: 1, upcoming: [] },
    });
    window.__invitePayload = payload;
  });

  const card = page.getByTestId("invite-row");
  const payload = await page.evaluate(() => window.__invitePayload);
  await expect(card).toHaveAttribute("data-session-id", payload);
  await expect(card).toContainText(payload);
  await expect(card.locator("[data-injected='invite-xss']")).toHaveCount(0);
  const accept = card.locator("[data-my-action='accept-invite']");
  const decline = card.locator("[data-my-action='decline-invite']");
  await expect(accept).toHaveAttribute("data-session-id", payload);
  await expect(decline).toHaveAttribute("data-session-id", payload);
  await expect(accept).toHaveAttribute("data-testid", `accept-invite-${payload}`);
  await expect(decline).toHaveAttribute("data-testid", `decline-invite-${payload}`);
  expect(runtimeErrors).toEqual([]);
});

test("invite response buttons dispatch, stay pending across replacement, and focus the alert on failure", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    const session = {
      canRespondInvite: true,
      court: "青年公園網球場",
      hostNickname: "邀請主揪",
      hostNtrp: 3.5,
      notes: "請帶新球",
      playType: "雙打",
      sessionId: 734,
      slotsRemaining: 1,
      startAt: "2099-07-19T01:00:00.000Z",
      status: "open",
      viewerParticipantStatus: "invited",
      viewerRole: "guest",
    };
    let rejectAccept;
    const pendingAccept = new Promise((_, reject) => {
      rejectAccept = reject;
    });
    const groups = { history: [], needsAction: [{ kind: "invite", session }], needsActionCount: 1, upcoming: [] };
    const render = () =>
      renderMySessionsPage(root, {
        actionScopeKey: "account-a",
        authenticated: true,
        groups,
        onAcceptInvite: async (sessionId) => {
          window.__acceptInviteCalls = [...(window.__acceptInviteCalls ?? []), sessionId];
          return pendingAccept;
        },
        onDeclineInvite: async (sessionId) => {
          window.__declineInviteCalls = [...(window.__declineInviteCalls ?? []), sessionId];
        },
      });
    window.__rerenderInvite = render;
    window.__rejectAcceptInvite = rejectAccept;
    render();
  });

  const accept = page.getByTestId("accept-invite-734");
  await accept.click();
  await expect.poll(() => page.evaluate(() => window.__acceptInviteCalls)).toEqual(["734"]);
  await page.evaluate(() => window.__rerenderInvite());
  await expect(accept).toBeDisabled();
  await page.evaluate(() => window.__rejectAcceptInvite(new Error("球局狀態已更新，請重新載入。")));
  const alert = page.locator("#my-sessions-root [data-my-sessions-error]");
  await expect(alert).toContainText("球局狀態已更新，請重新載入");
  await expect(accept).toBeEnabled();
  await expect(alert).toBeFocused();

  await page.getByTestId("decline-invite-734").click();
  await expect.poll(() => page.evaluate(() => window.__declineInviteCalls)).toEqual(["734"]);
  expect(runtimeErrors).toEqual([]);
});

test("declined My Sessions history uses neutral participation wording", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    renderMySessionsPage(root, {
      authenticated: true,
      groups: {
        history: [{
          court: "青年公園網球場",
          courtDistrict: "萬華區",
          hostNickname: "歷史主揪",
          hostNtrp: 3.5,
          ntrpMax: 4,
          ntrpMin: 3,
          playType: "雙打",
          sessionId: 735,
          slotsRemaining: 1,
          startAt: "2099-07-19T01:00:00.000Z",
          status: "open",
          viewerParticipantStatus: "declined",
          viewerRole: "guest",
        }],
        needsAction: [],
        needsActionCount: 0,
        upcoming: [],
      },
    });
  });

  const history = page.locator("#my-history");
  await expect(history).toContainText("已婉拒");
  await expect(history).toContainText("你的加入申請已被婉拒");
  await expect(history).not.toContainText("主揪婉拒");
  expect(runtimeErrors).toEqual([]);
});

test("a failed presence setting keeps focus on the control instead of jumping to the alert", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMePage } = await window.__importAppModule("sessionViews");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("me-page").hidden = false;
    renderMePage(document.getElementById("me-root"), {
      authSession: { user: { id: "presence-failure-test" } },
      onSetPresenceSharing: async () => {
        throw new Error("在線設定暫時無法更新。");
      },
      playerVisibility: false,
      presence: { locationStatus: "idle", openToGreeting: false, sharePresence: false },
      profile: { nick: "測試球友", ntrp: 3.5 },
    });
  });

  const presenceToggle = page.getByTestId("presence-sharing-toggle");
  await presenceToggle.focus();
  await presenceToggle.click();

  const error = page.locator("[data-presence-error]");
  await expect(error).toBeVisible();
  await expect(error).toHaveText("在線設定暫時無法更新。");
  // 落點與「我」頁其他設定一致:留在剛操作的控制項,role="alert" 自行朗讀。
  await expect(presenceToggle).toBeFocused();
  await expect(error).not.toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("Me owns player visibility while My Sessions omits both moved settings and preserves pending and error state", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMePage, renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("me-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("me-page").hidden = false;
    renderMySessionsPage(document.getElementById("my-sessions-root"), {
      authenticated: true,
      groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [] },
    });
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const render = () =>
      renderMePage(root, {
        authSession: { user: { id: "me-settings-test" } },
        onTogglePlayerVisibility: async () => {
          window.__visibilityToggleCalls = (window.__visibilityToggleCalls ?? 0) + 1;
          await pending;
          throw new Error("球友卡設定暫時無法更新。");
        },
        playerVisibility: false,
        presence: { locationStatus: "idle", openToGreeting: false, sharePresence: false },
        profile: { nick: "測試球友", ntrp: 3.5 },
      });
    window.__rerenderVisibility = render;
    window.__releaseVisibility = release;
    render();
  });

  const toggle = page.getByTestId("player-visibility-toggle");
  await expect(toggle).toHaveAttribute("role", "switch");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(toggle).toHaveText("已關閉");
  // D1:switch 的可及名稱要是狀態式、含主題,並且含可見文字(WCAG 2.5.3 Label in Name)。
  await expect(toggle).toHaveAttribute("aria-label", "球友卡：已關閉");
  await expect(toggle).toHaveAttribute("aria-describedby", "player-visibility-hint");
  const presenceToggle = page.getByTestId("presence-sharing-toggle");
  await expect(presenceToggle).toHaveAttribute("role", "switch");
  await expect(presenceToggle).toHaveAttribute("aria-checked", "false");
  // 可見文字改狀態式,不再與 aria-checked 打架(原本關閉時寫「開啟在線分享」)。
  await expect(presenceToggle).toHaveText("已關閉");
  await expect(presenceToggle).toHaveAttribute("aria-label", "在線分享：已關閉");
  await expect(presenceToggle).toHaveAttribute("aria-describedby", "presence-sharing-hint");
  // aria-describedby 指到的元素必須真的存在,否則等於沒有說明。
  await expect(page.locator("#me-root #player-visibility-hint")).toHaveCount(1);
  await expect(page.locator("#me-root #presence-sharing-hint")).toHaveCount(1);
  // D2:登入態只有一個 h1,其後一律 h2,不得再出現跳級或倒序。
  await expect
    .poll(() =>
      page.locator("#me-root :is(h1,h2,h3,h4,h5,h6)").evaluateAll((nodes) => nodes.map((node) => node.tagName))
    )
    .toEqual(["H1", "H2", "H2", "H2", "H2", "H2", "H2", "H2"]);
  await expect(page.locator(".player-visibility")).toContainText(
    "開啟後，你會出現在球友名單，主揪可以邀你加入球局；關閉後立即從名單移除。個人聯絡資訊不會顯示。"
  );
  // 一條有序斷言取代原本五組 nextElementSibling:限定 #me-root(原本會掃到整份文件)、
  // 走 expect.poll(原本是 await + 裸 expect 的瞬時快照),而且多插一個區塊也會紅。
  const ME_SECTION_ORDER = [
    "me-identity-card",
    "me-edit-profile",
    "player-visibility",
    "presence-settings",
    "notification-settings",
    "blocked-player-settings",
  ];
  await expect
    .poll(() =>
      page
        .locator(ME_SECTION_ORDER.map((name) => `#me-root .${name}`).join(", "))
        .evaluateAll((nodes, order) => nodes.map((node) => [...node.classList].find((name) => order.includes(name))), ME_SECTION_ORDER)
    )
    .toEqual(ME_SECTION_ORDER);
  // fix round 1(驗收退回):這裡的 groups 全空,My Sessions 現在只畫 dc 空狀態框
  // (三段 .my-sessions-section 都收成空容器,見上方新增的專屬回歸測試),不再是
  // 「至少一個 .my-sessions-section」——原斷言的真正目的只是確認 My Sessions 頁
  // 在 Me 頁重繪之間仍有自己獨立、有效的畫面,改驗空狀態框存在即可。用
  // toHaveCount 而非 toBeVisible:這裡只顯示 #me-page,#my-sessions-page 本身仍
  // hidden(這條測試從未把它切成可見),沿用原斷言「只驗 DOM 存在、不驗可見度」
  // 的語意。
  await expect(page.locator("#my-sessions-root [data-my-sessions-empty]")).toHaveCount(1);
  await expect(page.locator("#my-sessions-root [data-testid='player-visibility-toggle']")).toHaveCount(0);
  await expect(page.locator("#my-sessions-root [data-testid='presence-sharing-toggle']")).toHaveCount(0);
  await expect(page.locator("#my-sessions-root [data-testid='open-to-greeting-toggle']")).toHaveCount(0);
  await expect(page.locator("#my-sessions-root [data-testid='enable-push']")).toHaveCount(0);
  await expect(page.locator("#my-sessions-root [data-testid='subscribe-all-courts']")).toHaveCount(0);
  await expect(page.locator("#my-sessions-root [data-testid='blocked-player-list']")).toHaveCount(0);
  await expect(page.locator("#me-root [data-testid='player-visibility-toggle']")).toHaveCount(1);
  await expect(page.locator("#me-root [data-testid='presence-sharing-toggle']")).toHaveCount(1);
  await expect(page.locator("#me-root [data-testid='open-to-greeting-toggle']")).toHaveCount(1);
  await expect(page.locator("#me-root [data-testid='enable-push']")).toHaveCount(1);
  await expect(page.locator("#me-root [data-testid='subscribe-all-courts']")).toHaveCount(1);
  await expect(page.locator("#me-root [data-testid='blocked-player-list']")).toHaveCount(1);

  await toggle.click();
  await expect.poll(() => page.evaluate(() => window.__visibilityToggleCalls)).toBe(1);
  await page.evaluate(() => window.__rerenderVisibility());
  await expect(toggle).toBeDisabled();
  await page.evaluate(() => window.__releaseVisibility());
  await expect(page.locator("#me-root [data-my-sessions-error]")).toContainText("球友卡設定暫時無法更新");
  await expect(toggle).toBeEnabled();
  await expect(toggle).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("Me presence settings explain reciprocal visibility, request sharing, and offer one-tap hiding", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMePage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("me-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("me-page").hidden = false;
    renderMePage(root, {
      authSession: { user: { id: "me-presence-test" } },
      onSetOpenToGreeting: async (open) => {
        window.__greetingValue = open;
      },
      onSetPresenceSharing: async (shared) => {
        window.__sharingValue = shared;
      },
      presence: { locationStatus: "denied", openToGreeting: true, sharePresence: true },
      profile: { nick: "測試球友", ntrp: 3.5 },
    });
  });

  const sharing = page.getByTestId("presence-sharing-toggle");
  await expect(sharing).toHaveAttribute("role", "switch");
  await expect(sharing).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("presence-location-status")).toContainText("拒絕");
  await expect(page.locator(".presence-settings")).toContainText("其他也有開啟在線分享、且已填暱稱與 NTRP 的球友可見");
  await page.getByTestId("open-to-greeting-toggle").uncheck();
  await expect.poll(() => page.evaluate(() => window.__greetingValue)).toBe(false);
  await sharing.click();
  await expect.poll(() => page.evaluate(() => window.__sharingValue)).toBe(false);
  expect(runtimeErrors).toEqual([]);
});

test("Me notification settings save six preferences and Taipei court subscriptions", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMePage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("me-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("me-page").hidden = false;
    renderMePage(root, {
      authSession: { user: { id: "notification-settings-test" } },
      courts: [
        { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
        { city: "台北市", district: "中山區", id: 9, name: "第二球場" },
        { city: "台北市", district: "萬華區", id: 10, name: "第三球場" },
      ],
      notificationSettings: {
        courtIds: [],
        prefs: {
          chatMessageEnabled: true,
          guestInvitedEnabled: true,
          guestRequestReviewedEnabled: true,
          hostNewRequestEnabled: true,
          sessionReminderEnabled: true,
          sessionUpdatedEnabled: true,
        },
        pushStatus: "idle",
        webPushConfigured: true,
      },
      onEnablePush: async () => {
        window.__enablePushCalls = (window.__enablePushCalls ?? 0) + 1;
      },
      onSaveCourtSubscriptions: async (courtIds) => {
        window.__savedCourtSubscriptions = courtIds;
      },
      onSaveNotificationPreferences: async (preferences) => {
        window.__savedNotificationPreferences = preferences;
      },
    });
  });

  const settings = page.locator("#me-root .notification-settings");
  await expect(settings).toContainText("通知設定");
  await expect(settings).toContainText("加入主畫面");
  await expect(settings).toContainText("推播開關只影響這台裝置；下方的事件偏好套用到你的帳號。");
  await expect(page.getByTestId("enable-push")).toHaveText("開啟推播");
  await expect(settings).not.toContainText("行政區");
  await expect(page.locator("[data-notification-district]")).toHaveCount(0);
  await expect(page.getByTestId("notification-session-updated")).toBeChecked();
  await expect(page.getByTestId("notification-chat-message")).toBeChecked();
  await expect(page.getByTestId("notification-session-reminder")).toBeChecked();
  await expect(settings).toContainText("場地時間定案與球局取消一定會通知，無法關閉");
  // 三座球場都沒訂閱 → 主控未勾、計數為 0、清單預設收合。
  await expect(page.getByTestId("subscribe-all-courts")).toBeEnabled();
  await expect(page.getByTestId("subscribe-all-courts")).not.toBeChecked();
  await expect(settings).toContainText("已訂閱 0 座");
  await expect(page.locator("#notification-court-picker")).toBeHidden();
  await page.getByTestId("toggle-court-picker").click();
  await expect(page.locator("#notification-court-picker")).toBeVisible();

  await page.getByTestId("enable-push").click();
  await expect.poll(() => page.evaluate(() => window.__enablePushCalls)).toBe(1);

  await page.getByTestId("notification-host-new-request").uncheck();
  // 存檔期間所有控制項會被 disable，焦點會掉到 body；托管必須把它送回原控制項。
  await expect(page.getByTestId("notification-host-new-request")).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__savedNotificationPreferences)).toEqual({
    chatMessageEnabled: true,
    guestInvitedEnabled: true,
    guestRequestReviewedEnabled: true,
    hostNewRequestEnabled: false,
    sessionReminderEnabled: true,
    sessionUpdatedEnabled: true,
  });

  // 細選路徑：逐一勾兩座，計數與送出的 id 都要跟著走。
  await page.getByTestId("notification-court-8").check();
  await expect(settings).toContainText("已訂閱 1 座");
  await page.getByTestId("notification-court-10").check();
  await expect.poll(() => page.evaluate(() => window.__savedCourtSubscriptions)).toEqual([8, 10]);
  await expect(settings).toContainText("已訂閱 2 座");
  await expect(page.getByTestId("subscribe-all-courts")).not.toBeChecked();
  // 主控一鍵全選：送出的 id 數必須等於當下台北市 active 球場數。
  await page.getByTestId("subscribe-all-courts").check();
  await expect.poll(() => page.evaluate(() => window.__savedCourtSubscriptions)).toEqual([8, 9, 10]);
  await expect(settings).toContainText("已訂閱 3 座");
  expect(runtimeErrors).toEqual([]);
});

test("Me notification settings allow every listed Taipei court", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMePage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("me-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("me-page").hidden = false;
    const courts = Array.from({ length: 11 }, (_, index) => ({
      city: "台北市",
      district: `測試區${index + 1}`,
      id: index + 1,
      name: `測試球場${index + 1}`,
    }));
    renderMePage(root, {
      authSession: { user: { id: "notification-courts-test" } },
      courts,
      notificationSettings: { courtIds: courts.slice(0, 10).map((court) => court.id) },
      onSaveCourtSubscriptions: async (courtIds) => {
        window.__savedElevenCourts = courtIds;
      },
    });
  });

  // 正向前提：11 座都渲染成 checkbox，下面的全選才驗得到「全部」。
  const courtBoxes = page.locator("#notification-court-picker input[data-notification-court]");
  await expect(courtBoxes).toHaveCount(11);
  await page.getByTestId("subscribe-all-courts").check();
  await expect.poll(() => page.evaluate(() => window.__savedElevenCourts)).toEqual(
    Array.from({ length: 11 }, (_, index) => index + 1)
  );
  await expect(page.locator("#me-root [data-notification-error]")).toBeHidden();
  await expect(page.locator("#me-root")).toContainText("已訂閱 11 座");
  expect(runtimeErrors).toEqual([]);
});

test("the profile sheet keeps its gate framing but drops it in standalone mode", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  // 同一組輸入，只換 mode，差異才歸因得到 mode 本身。
  const openWith = (mode) =>
    page.evaluate(async (sheetMode) => {
      const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
      openProfileCompletionSheet({
        courts: [{ city: "台北市", id: 8, name: "示範球場" }],
        intent: { action: "join" },
        mode: sheetMode,
        profile: { courts: new Set(), nick: "測試球友", ntrp: 3.5, slots: new Set(), types: new Set() },
        returnSession: { court: "示範球場", startAt: "2026-07-18T01:30:00.000Z" },
      });
    }, mode);

  const sheet = page.locator("#profile-completion-sheet");

  await openWith("gate");
  await expect(sheet.locator(".surface__eyebrow")).toHaveText("完成後即可繼續");
  await expect(sheet.locator("h2")).toHaveText("完成個人檔案");
  await expect(page.getByTestId("profile-save")).toHaveText("儲存並繼續");
  await expect(sheet).toContainText("完成後將回到：示範球場・");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  await openWith("standalone");
  await expect(sheet.locator(".surface__eyebrow")).toHaveText("個人檔案");
  await expect(sheet.locator("h2")).toHaveText("編輯個人檔案");
  await expect(page.getByTestId("profile-save")).toHaveText("儲存");
  await expect(sheet).not.toContainText("完成後將回到");
  // 欄位與揭露文字兩模式相同，換的只有語氣。
  await expect(sheet.getByLabel("公開暱稱")).toBeVisible();
  await expect(sheet.locator("#profile-ntrp")).toBeVisible();
  await expect(sheet.locator("[data-testid='profile-form']")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("a rerender inside a notification action stays authoritative over the disable restore", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMePage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("me-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("me-page").hidden = false;
    // 模擬 enablePushNotifications 的真實形狀：回呼在自己的 await 之內同步重繪，
    // 新 markup 依 pushStatus 決定 disabled，回呼結束後動作 helper 的 finally 才跑。
    let current = { courtIds: [], prefs: {}, pushStatus: "idle", webPushConfigured: true };
    const render = () =>
      renderMePage(root, {
        authSession: { user: { id: "push-rerender-test" } },
        notificationSettings: current,
        onEnablePush: async () => {
          window.__pushCalls = (window.__pushCalls ?? 0) + 1;
          current = { ...current, pushStatus: "enabled" };
          render();
        },
      });
    render();
  });

  const enablePush = page.getByTestId("enable-push");
  await expect(enablePush).toBeEnabled();
  await enablePush.click();
  await expect.poll(() => page.evaluate(() => window.__pushCalls)).toBe(1);
  await expect(enablePush).toHaveText("此裝置已開啟");
  // 重繪後的 markup 才是 disabled 的權威；還原不得把它判定為停用的按鈕解鎖。
  await expect(enablePush).toBeDisabled();
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions moves focus to an updated card and scopes pending actions to the current account render", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    const session = {
      canWithdraw: true,
      court: "青年公園網球場",
      courtDistrict: "萬華區",
      hostNickname: "公開主揪",
      hostNtrp: 3.5,
      hostProfileComplete: true,
      ntrpMax: 4,
      ntrpMin: 3,
      playType: "單打",
      sessionId: 732,
      slotsRemaining: 1,
      startAt: "2099-07-19T01:00:00.000Z",
      status: "open",
      viewerParticipantStatus: "accepted",
      viewerRole: "host",
    };
    const request = { nickname: "待處理球友", participantId: 16, profileId: 26, role: "guest", status: "requested" };
    const groupsWithRequest = { history: [], needsAction: [{ kind: "host-request", participant: request, session }], needsActionCount: 1, upcoming: [session] };
    const groupsAfterReview = { history: [], needsAction: [], needsActionCount: 0, upcoming: [session] };
    const render = ({ groups, onAccept = async () => {}, scopeKey }) =>
      renderMySessionsPage(root, { actionScopeKey: scopeKey, authenticated: true, groups, onAccept });

    window.__renderAfterReview = () => render({ groups: groupsAfterReview, scopeKey: "account-a" });
    render({
      groups: groupsWithRequest,
      onAccept: async () => window.__renderAfterReview(),
      scopeKey: "account-a",
    });
  });

  // 批 D6:session 732 是 host-request(host-request kind 恆為「我主揪的」)+
  // viewerRole host 的 upcoming 卡,兩者都只在 hosted 分頁——預設分頁是「我報名的」,
  // 先切過去才找得到 accept-participant-16;分頁狀態掛在 root 上,accept 之後的
  // 重繪(groupsAfterReview)不會把它切回去,聚焦骨架照舊在 hosted 分頁內運作。
  await page.getByTestId("my-sessions-seg-hosted").click();
  await page.getByTestId("accept-participant-16").click();
  await expect(page.locator("[data-open-my-session][data-session-id='732']")).toBeFocused();

  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    const session = {
      canWithdraw: true,
      court: "青年公園網球場",
      courtDistrict: "萬華區",
      hostNickname: "公開主揪",
      hostNtrp: 3.5,
      hostProfileComplete: true,
      ntrpMax: 4,
      ntrpMin: 3,
      playType: "單打",
      sessionId: 733,
      slotsRemaining: 1,
      startAt: "2099-07-19T01:00:00.000Z",
      status: "open",
      viewerParticipantStatus: "accepted",
      viewerRole: "guest",
    };
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const render = (scopeKey, groups, onWithdraw) =>
      renderMySessionsPage(root, { actionScopeKey: scopeKey, authenticated: true, groups, onWithdraw });
    window.__releaseAccountAAction = release;
    render(
      "account-a",
      { history: [], needsAction: [], needsActionCount: 0, upcoming: [session] },
      async () => {
        await pending;
        throw new Error("登入狀態已變更，請重新整理後再試。");
      }
    );
  });

  // 批 D6:session 733 是 viewerRole guest 的 upcoming 卡,屬「我報名的」分頁;
  // 前一段把分頁切到「我主揪的」,這裡切回來才找得到它的 withdraw 鈕。
  await page.getByTestId("my-sessions-seg-joined").click();
  await page.locator("[data-my-action='withdraw'][data-session-id='733']").click();
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    const session = {
      canWithdraw: true,
      court: "新帳號球局",
      courtDistrict: "大安區",
      hostNickname: "B 的主揪",
      hostNtrp: 3.5,
      hostProfileComplete: true,
      ntrpMax: 4,
      ntrpMin: 3,
      playType: "單打",
      sessionId: 733,
      slotsRemaining: 1,
      startAt: "2099-07-20T01:00:00.000Z",
      status: "open",
      viewerParticipantStatus: "accepted",
      viewerRole: "guest",
    };
    renderMySessionsPage(root, {
      actionScopeKey: "account-b",
      authenticated: true,
      groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [session] },
    });
  });
  const accountBWithdraw = page.locator("[data-my-action='withdraw'][data-session-id='733']");
  await expect(accountBWithdraw).toBeEnabled();
  await page.evaluate(() => window.__releaseAccountAAction());
  await expect(accountBWithdraw).toBeEnabled();
  await expect(page.locator("#my-sessions-root [data-my-sessions-error]")).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

test("anonymous My Sessions has a login next step instead of three dead-end empty lists", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.getByTestId("my-sessions-tab").click();
  const destination = page.locator("#my-sessions-page");
  await expect(destination).toContainText("登入後查看與管理你的球局");
  await expect(destination.getByRole("button", { name: "登入" })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("report dialog requires a reason, preserves failures, and acknowledges a successful report", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openReportDialog } = await window.__importAppModule("sessionViews");
    window.__reportReasons = [];
    openReportDialog({
      targetLabel: "青年公園網球場 · 週六上午",
      onSubmit: async (reason) => {
        window.__reportReasons.push(reason);
        if (reason === "其他") throw new Error("暫時無法送出");
        return { reportId: 1 };
      },
    });
  });

  const dialog = page.locator("#report-dialog");
  await expect(dialog.getByTestId("report-form")).toBeVisible();
  await expect(dialog).toContainText("青年公園網球場 · 週六上午");
  await dialog.getByLabel("其他").check();
  await dialog.getByTestId("report-submit").click();
  await expect(dialog.getByRole("alert")).toContainText("暫時無法送出");
  await expect(dialog.getByTestId("report-form")).toBeVisible();
  await dialog.getByLabel("與實際球局不符").check();
  await dialog.getByTestId("report-submit").click();
  await expect(dialog.getByTestId("report-form")).toBeHidden();
  await expect(dialog).toContainText("已送出檢舉，謝謝你的回報。");
  await expect.poll(() => page.evaluate(() => window.__reportReasons)).toEqual(["其他", "與實際球局不符"]);
  expect(runtimeErrors).toEqual([]);
});

// 批 C2-2 fix round 1(review Important):sheets.js 的 resolveRestoreTarget 是通用
// 函式,不是抽屜專屬——這裡驗證非抽屜語境(My Sessions 卡片開的檢舉 dialog)的卡片
// 在 dialog 開著時消失、關閉 dialog 後,焦點不會被誤導跳去抽屜的摘要條(toggle)。
// 修法前(無 half/full 新 fallback 前)這裡就是「找不到就不移動」,落在 body——
// 這條測試把這個既有行為鎖住,防止未來又把抽屜專屬 fallback 無條件擴大到所有 surface。
test("closing a non-drawer report dialog after its trigger card disappears does not steal focus to the drawer toggle", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    renderMySessionsPage(document.getElementById("my-sessions-root"), {
      authenticated: true,
      groups: {
        history: [],
        needsAction: [],
        needsActionCount: 0,
        upcoming: [
          {
            court: "青年公園網球場",
            courtDistrict: "萬華區",
            hostNickname: "示範主揪",
            hostNtrp: 3.5,
            ntrpMax: 4,
            ntrpMin: 3,
            playType: "雙打",
            sessionId: 424242,
            slotsRemaining: 1,
            startAt: "2099-07-19T01:00:00.000Z",
            status: "open",
            viewerParticipantStatus: "accepted",
            viewerRole: "guest",
          },
        ],
      },
    });
  });

  const reportButton = page.getByTestId("report-session-424242");
  await reportButton.focus();
  await expect(reportButton).toBeFocused();

  await page.evaluate(async () => {
    const { openReportDialog } = await window.__importAppModule("sessionViews");
    openReportDialog({ targetLabel: "青年公園網球場 · 週六上午" });
  });
  await expect(page.locator("#report-dialog")).toBeVisible();

  // 模擬背景重繪把這張卡從清單移除(球局已被取消/使用者離開等)——觸發它的按鈕連帶消失。
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    renderMySessionsPage(document.getElementById("my-sessions-root"), {
      authenticated: true,
      groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [] },
    });
  });
  await expect(page.getByTestId("report-session-424242")).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(page.locator("#report-dialog")).toBeHidden();

  // 修法前行為:resolveRestoreTarget 找不到卡片、也找不到 full 專屬的
  // [data-nearby-dialog] [data-nearby-close](這裡抽屜是 collapsed),不移動焦點,
  // 落在瀏覽器把已移除節點的焦點預設收回的 body。
  await expect(page.locator("#nearby-sessions-toggle")).not.toBeFocused();
  await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  expect(runtimeErrors).toEqual([]);
});

// 批 11-D:上面那條測試只斷 `#report-dialog` 這層殼(visible/hidden)。批 8.7 的
// canary A 實證過:把 ReportDialog 的 React render 換成 null,殼仍然 visible,那條
// 測試照樣綠——內容整個不見也抓不到。這一條補上內容層,涵蓋範圍與上面那條相同的
// 非抽屜語境(My Sessions 卡片開的檢舉 dialog),並且刻意在「觸發卡片已消失」之後
// 再驗一次,確認背景重繪不會連帶抹掉 dialog 內容。
test("the non-drawer report dialog renders its full content and keeps it after the trigger card disappears", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    renderMySessionsPage(document.getElementById("my-sessions-root"), {
      authenticated: true,
      groups: {
        history: [],
        needsAction: [],
        needsActionCount: 0,
        upcoming: [
          {
            court: "青年公園網球場",
            courtDistrict: "萬華區",
            hostNickname: "示範主揪",
            hostNtrp: 3.5,
            ntrpMax: 4,
            ntrpMin: 3,
            playType: "雙打",
            sessionId: 424242,
            slotsRemaining: 1,
            startAt: "2099-07-19T01:00:00.000Z",
            status: "open",
            viewerParticipantStatus: "accepted",
            viewerRole: "guest",
          },
        ],
      },
    });
  });

  await page.getByTestId("report-session-424242").focus();
  await page.evaluate(async () => {
    const { openReportDialog } = await window.__importAppModule("sessionViews");
    openReportDialog({ targetLabel: "青年公園網球場 · 週六上午" });
  });

  const dialog = page.locator("#report-dialog");
  await expect(dialog).toBeVisible();
  // 內容層:標題、目標敘述、四個檢舉原因 radio、送出鈕——殼在但內容空會全紅。
  await expect(dialog.getByRole("heading", { name: "回報問題" })).toBeVisible();
  await expect(dialog).toContainText("青年公園網球場 · 週六上午");
  const form = dialog.getByTestId("report-form");
  await expect(form).toBeVisible();
  await expect(form.getByRole("group", { name: "檢舉原因" })).toBeVisible();
  const reasons = form.locator("input[name='report-reason']");
  await expect(reasons).toHaveCount(4);
  expect(await reasons.evaluateAll((inputs) => inputs.map((input) => `${input.type}:${input.value}`))).toEqual([
    "radio:與實際球局不符",
    "radio:不當行為",
    "radio:疑似詐騙",
    "radio:其他",
  ]);
  const submit = dialog.getByTestId("report-submit");
  await expect(submit).toBeVisible();
  await expect(submit).toHaveText("送出檢舉");

  // 背景重繪把觸發卡片抽走(與上面那條同一個情境),dialog 內容必須原封不動。
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    renderMySessionsPage(document.getElementById("my-sessions-root"), {
      authenticated: true,
      groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [] },
    });
  });
  await expect(page.getByTestId("report-session-424242")).toHaveCount(0);
  await expect(form).toBeVisible();
  await expect(reasons).toHaveCount(4);
  await expect(submit).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("a pending withdrawal accepts only one intentional submission", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openSessionSheet, openWithdrawSessionConfirmation } = await window.__importAppModule("sessionViews");
    let releaseWithdrawal;
    window.__withdrawalCalls = 0;
    window.__releaseWithdrawal = () => releaseWithdrawal?.();
    const pendingWithdrawal = new Promise((resolve) => {
      releaseWithdrawal = resolve;
    });
    openSessionSheet(
      {
        court: "示範球場",
        courtDistrict: "大安區",
        startAt: "2026-07-19T01:00:00.000Z",
        playType: "單打",
        ntrpMin: 3,
        ntrpMax: 4,
        slotsRemaining: 1,
        hostNickname: "示範松果",
        hostNtrp: 3.5,
        hostProfileComplete: true,
        notes: "測試",
      },
      {
        action: { label: "申請等待中", disabled: true, secondaryLabel: "撤回申請" },
        onWithdraw: () =>
          openWithdrawSessionConfirmation({
            onConfirm: async () => {
              window.__withdrawalCalls += 1;
              await pendingWithdrawal;
            },
          }),
      }
    );
  });

  const withdraw = page.locator("#session-sheet [data-session-action='secondary']");
  await withdraw.click();
  const confirmation = page.getByRole("dialog", { name: "確認退出這一局？" });
  const confirm = confirmation.getByRole("button", { name: "確認退出" });
  await page.evaluate(() => {
    const button = document.querySelector("#withdraw-session-confirmation [data-confirm-withdraw]");
    button?.click();
    button?.click();
  });
  await expect.poll(() => page.evaluate(() => window.__withdrawalCalls)).toBe(1);
  await expect(withdraw).toBeEnabled();
  await expect(confirm).toBeDisabled();
  await page.evaluate(() => window.__releaseWithdrawal());
  await expect(confirmation).toBeHidden();
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
  await expect
    .poll(() =>
      sheet
        .locator("[data-session-field], [data-session-action]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-session-field") ?? node.getAttribute("data-session-action"))
        )
    )
    .toEqual(["venue", "court", "time", "details", "host", "notes", "copy-link", "primary"]);
  await expectWithinViewport(page, sheet);

  await page.keyboard.press("Escape");
  await expect(firstCard).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#nearby-sessions-toggle")).toBeFocused();
  await forceZeroMatchDistrictFilter(page);
  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#discovery-empty")).toBeVisible();
  await expect(page.locator("#discovery-empty")).toContainText("這個範圍暫時沒有可加入的球局");
  await expect(page.locator("#discovery-retry")).toHaveCount(0);
  await expect(page.locator("#discovery-reset")).toBeVisible();
  await expect(page.locator("#discovery-expand")).toBeVisible();
  await expect(page.locator("#discovery-first")).toBeVisible();
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
  const fallbackAnnouncement = page.locator("#nearby-sessions-list [role='status']");
  await expect(fallbackAnnouncement).toContainText("地圖目前無法使用");
  await expect(fallbackAnnouncement).toHaveAttribute("aria-live", "polite");
  await expect(fallbackAnnouncement).toHaveJSProperty("inert", false);
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "true");
  // 批 D2:setMapUnavailable() 的 auto-expand 落在 v2 的 open(非 modal:無 backdrop、
  // header 不 inert)。
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");
  await expect(page.locator("#nearby-sessions-backdrop")).toHaveCount(0);
  await expect(page.locator(".map-topbar")).toHaveJSProperty("inert", false);
  await expect(page.locator("[data-testid='session-card']").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "false");
  await page.locator("#use-my-location").click();
  await expect(page.locator("#location-feedback")).toContainText("無法取得位置");
  await expect(page.locator("#use-my-location")).toBeEnabled();
  await expect(page.locator("#use-my-location")).toBeFocused();
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
  const visibleMarkerOptions = await page.evaluate(() => window.__fakeMapsSnapshot().visibleMarkerOptions);
  expect(visibleMarkerOptions.every((marker) => marker.optimized === false)).toBe(true);

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
  await expect(page.locator("#discovery-retry")).toHaveCount(0);
  await expect(page.locator("#discovery-reset")).toBeHidden();
  await expect(page.locator("#discovery-expand")).toBeVisible();
  await expect(page.locator("#discovery-first")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("signed-out first-visit empty state explains the product instead of just prompting a retry", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await setFakeMapBounds(page, { south: 25.14, west: 121.6, north: 25.16, east: 121.62 });
  await page.waitForTimeout(310);
  // 批 D2:v2 的 0 結果 peek 是白底出路卡(dc L126-131):文字本身是開抽屜入口,
  // 並直接給「開一場」行動;抽屜內的 discovery-empty 保留完整出路組。
  await expect(page.locator(".nearby-peek--empty")).toBeVisible();
  await expect(page.locator("#peek-create")).toBeVisible();
  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#discovery-empty")).toBeVisible();
  await expect(page.locator("#discovery-first")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("empty-state contextual buttons and the subscribe shortcut are visible and clickable while the drawer is open", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await forceZeroMatchDistrictFilter(page);
  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");
  await expect(page.locator("#nearby-sessions-backdrop")).toHaveCount(0);
  await expect(page.locator("#map")).toHaveJSProperty("inert", false);
  await expect(page.locator("#discovery-empty")).toBeVisible();

  // B2 情境按鈕(有作用中篩選時才有的「清除篩選」＋恆在的「擴大地圖範圍」／「開第一局」)
  // 與 B6 訂閱捷徑(「有新球局時通知我」)在 open 都要可見、可點。
  const resetButton = page.locator("#discovery-reset");
  const expandButton = page.locator("#discovery-expand");
  const subscribeButton = page.locator("#discovery-subscribe");
  const firstButton = page.locator("#discovery-first");
  for (const button of [resetButton, expandButton, subscribeButton, firstButton]) {
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  }

  await resetButton.click();
  await expect(page.locator("[data-testid='session-card']").first()).toBeVisible();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");
  expect(runtimeErrors).toEqual([]);
});

test("the empty-state subscribe shortcut opens Me and can focus the notification settings heading", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await setFakeMapBounds(page, { south: 25.14, west: 121.6, north: 25.16, east: 121.62 });
  await page.waitForTimeout(310);
  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#discovery-empty")).toBeVisible();
  const subscribeButton = page.locator("#discovery-subscribe");
  await expect(subscribeButton).toBeVisible();
  await expect(subscribeButton).toHaveText("有新球局時通知我");
  await expect(subscribeButton).toHaveClass(/session-secondary/);

  await subscribeButton.click();
  await expect(page.locator("#tab-map")).toBeHidden();
  await expect(page.locator("#my-sessions-page")).toBeHidden();
  await expect(page.locator("#me-page")).toBeVisible();

  // Mock 模式沒有真登入（VITE_SUPABASE_URL 固定為 "___"，main.js 的 authSession
  // 永遠是 null），通知設定區只在 authenticated 才渲染，showMePage 的真實點擊路徑
  // 無法在這個 harness 走到已登入內容。這裡改用既有的 renderMePage 直接渲染慣例
  // （比照本檔 "Me notification settings save six preferences" 測試）驗證
  // sessionViews.js 承諾的掛點契約：標題確實可以是 document.activeElement。
  await page.evaluate(async () => {
    const { renderMePage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("me-root");
    renderMePage(root, {
      authSession: { user: { id: "discovery-subscribe-focus-test" } },
      profile: { nick: "測試球友", ntrp: 3.5 },
    });
    document.querySelector("[data-notification-settings-heading]")?.focus({ preventScroll: false });
  });
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.hasAttribute("data-notification-settings-heading")))
    .toBe(true);
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

test("drawer-card focus survives discovery rerenders and remains a logical sheet restore target", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  const card = page.locator("[data-testid='session-card']").first();
  await card.focus();
  await setFakeMapBounds(page, { south: 25.0, west: 121.49, north: 25.1, east: 121.61 });
  await page.waitForTimeout(310);

  const rerenderedCard = page.locator("[data-testid='session-card']").first();
  await expect(rerenderedCard).toBeFocused();
  await rerenderedCard.press("Enter");
  await expect(page.locator("#session-sheet")).toBeVisible();

  await setFakeMapBounds(page, { south: 25.0, west: 121.49, north: 25.1, east: 121.61 });
  await page.waitForTimeout(310);
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-testid='session-card']").first()).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("player drawer and card escape every public value and render self and empty invitation states", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const views = await window.__importAppModule("sessionViews");
    const player = {
      profileId: '\"><img id="profile-injection" src=x onerror=alert(1)>',
      nickname: '<img id="nickname-injection" src=x onerror=alert(1)>',
      ntrp: '3.5\"><img id="ntrp-injection">',
      playTypes: ['單打<img id="type-injection">'],
      slotCodes: ['we-m<img id="slot-injection">'],
      courtName: '<img id="court-injection">',
      courtDistrict: '<img id="district-injection">',
      isSelf: false,
    };
    views.openCourtPlayersDrawer?.(
      { id: 8, name: '<img id="drawer-court-injection">', district: '<img id="drawer-district-injection">' },
      [player],
      { onOpenPlayer: (selected) => { window.__selectedEscapedPlayer = selected.profileId; } }
    );
  });
  await expect(page.locator("#court-players-sheet")).toBeVisible();
  await expect(page.locator("#sheet-root img")).toHaveCount(0);
  await page.locator("[data-player-id]").click();
  expect(await page.evaluate(() => window.__selectedEscapedPlayer)).toContain("profile-injection");

  await page.evaluate(async () => {
    const views = await window.__importAppModule("sessionViews");
    views.openPlayerCardSheet?.({
      profileId: 88,
      nickname: '<img id="card-nickname-injection">',
      ntrp: 3.5,
      playTypes: ['單打<img id="card-type-injection">'],
      slotCodes: ['we-a', 'mystery<img id="card-slot-injection">'],
      courtName: '<img id="card-court-injection">',
      courtDistrict: '<img id="card-district-injection">',
      isSelf: true,
    });
  });
  await expect(page.locator("#player-card-sheet")).toBeVisible();
  await expect(page.locator("#player-card-sheet img")).toHaveCount(0);
  await expect(page.locator("#player-card-sheet .player-profile")).toContainText('時段：週末下午、mystery<img id="card-slot-injection">');
  await expect(page.locator("#player-card-sheet [data-player-invite]")).toHaveCount(0);

  await page.evaluate(async () => {
    const views = await window.__importAppModule("sessionViews");
    window.__createFromPlayer = 0;
    views.openPlayerCardSheet?.(
      { profileId: 89, nickname: "無球局球友", ntrp: 3, playTypes: [], slotCodes: [], courtName: "河濱", courtDistrict: "中山區", isSelf: false },
      { myInvitableSessions: [], onCreate: () => { window.__createFromPlayer += 1; } }
    );
  });
  await expect(page.getByText("你目前沒有可邀請的球局", { exact: true })).toBeVisible();
  await page.getByTestId("player-create-session").click();
  expect(await page.evaluate(() => window.__createFromPlayer)).toBe(1);
  expect(runtimeErrors).toEqual([]);
});

// 批 D8:我頁 profile 卡／球友名單列／球友卡改 dc §1-3 的 avatar+NTRP 磚結構——這裡
// 驗結構(avatar/名/磚/副行對應資料),不只驗存在;NTRP 正反兩例都要驗到,null 必須
// 顯示「—」而不是 Number(null)=0 的舊陷阱(hosted QA 曾因此出過一次 bug)。
test("D8 profile card, directory row, and player card render the avatar+NTRP-brick structure and show em dash for unset NTRP", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  // ── 我頁 profile 卡:NTRP 已填正例 ───────────────────────────────
  await page.evaluate(async () => {
    const { renderMePage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("me-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("me-page").hidden = false;
    window.__d8EditProfileCalls = 0;
    renderMePage(root, {
      authSession: { user: { id: "d8-me-brick" } },
      courts: [{ id: 8, name: "示範球場", district: "大安區", city: "台北市", isActive: true }],
      onEditProfile: () => {
        window.__d8EditProfileCalls += 1;
      },
      profile: { courts: new Set(["8"]), nick: "測試球友", ntrp: 3.5, slots: new Set(["we-e"]) },
    });
  });
  const meCard = page.getByTestId("me-identity-card");
  await expect(meCard.locator(".ntrp-brick__value")).toHaveText("3.5");
  await expect(meCard.locator(".player-avatar--lg")).toHaveCount(1);
  await expect(meCard).toContainText("常打 示範球場 · 週末晚上");
  // 映射決策 2:整張卡也是編輯入口,不只下方 .me-edit-profile 區塊的「編輯」鈕。
  await page.getByTestId("me-profile-edit-trigger").click();
  await expect.poll(() => page.evaluate(() => window.__d8EditProfileCalls)).toBe(1);

  // ── 我頁 profile 卡:NTRP 未填反例 → 磚顯示「—」 ───────────────────
  await page.evaluate(async () => {
    const { renderMePage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("me-root");
    renderMePage(root, {
      authSession: { user: { id: "d8-me-brick" } },
      profile: { nick: "無程度球友", ntrp: null },
    });
  });
  await expect(page.getByTestId("me-identity-card").locator(".ntrp-brick__value")).toHaveText("—");

  // ── 球友名單列:結構對應資料,含一筆 NTRP null 反例 ──────────────────
  await page.evaluate(async () => {
    const { openPlayerDirectoryList } = await window.__importAppModule("sessionViews");
    const sheet = openPlayerDirectoryList({});
    sheet.setDirectory({
      players: [
        { courtNames: ["示範球場"], isPresent: false, nickname: "有程度球友", ntrp: 4, profileId: 701, slotCodes: ["we-e"] },
        { courtNames: ["第二球場"], isPresent: false, nickname: "未填程度球友", ntrp: null, profileId: 702, slotCodes: [] },
      ],
      status: "ready",
    });
  });
  const firstRow = page.getByTestId("player-directory-row-701");
  await expect(firstRow.locator(".player-avatar--md")).toHaveCount(1);
  await expect(firstRow.locator(".ntrp-brick--sm")).toHaveText("4.0");
  await expect(firstRow).toContainText("常打 示範球場 · 週末晚上");
  await expect(page.getByTestId("player-directory-row-702").locator(".ntrp-brick--sm")).toHaveText("—");

  // ── 球友卡:頭部結構+NTRP 磚(null 反例)+逐字註腳+看球友名單觸發 onSeeDirectory ──
  await page.evaluate(async () => {
    const { openPlayerCardSheet } = await window.__importAppModule("sessionViews");
    window.__d8SeeDirectoryCalls = 0;
    openPlayerCardSheet(
      { courtName: "第三球場", isSelf: false, nickname: "球友卡球友", ntrp: null, profileId: 703, slotCodes: ["wd-m"] },
      {
        onSeeDirectory: () => {
          window.__d8SeeDirectoryCalls += 1;
        },
      }
    );
  });
  const card = page.locator("#player-card-sheet");
  await expect(card.locator(".player-avatar--lg")).toHaveCount(1);
  await expect(card.locator(".ntrp-brick__value")).toHaveText("—");
  await expect(card).toContainText("常打 第三球場 · 平日早上");
  await expect(card).toContainText("在線球友為開放名單者;邀約請透過球局。");
  await page.locator("[data-player-see-directory]").click();
  await expect.poll(() => page.evaluate(() => window.__d8SeeDirectoryCalls)).toBe(1);
  expect(runtimeErrors).toEqual([]);
});

test("player invitation form escapes session fields and is pending-safe across success, errors, and stale surfaces", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const views = await window.__importAppModule("sessionViews");
    window.__inviteControls = {};
    window.__inviteCalls = [];
    const promise = new Promise((resolve, reject) => Object.assign(window.__inviteControls, { reject, resolve }));
    views.openPlayerCardSheet?.(
      { profileId: 91, nickname: "可邀球友", ntrp: 4, playTypes: ["雙打"], slotCodes: ["we-a"], courtName: "大佳", courtDistrict: "中山區", isSelf: false },
      {
        myInvitableSessions: [{
          sessionId: '\"><img id="session-id-injection">',
          startAt: '2030-01-01T01:00:00.000Z<img id="date-injection">',
          court: '<img id="session-court-injection">',
          courtDistrict: '<img id="session-district-injection">',
          playType: '<img id="session-type-injection">',
          notes: '<img id="session-notes-injection">',
        }],
        onInvite: (sessionId) => { window.__inviteCalls.push(sessionId); return promise; },
      }
    );
  });
  await expect(page.locator("#player-card-sheet img")).toHaveCount(0);
  await page.getByTestId("player-invite-session").check();
  await page.getByTestId("player-invite-submit").click();
  await expect(page.getByTestId("player-invite-submit")).toBeDisabled();
  await page.evaluate(() => window.__inviteControls.resolve({ outcome: "OK" }));
  await expect(page.getByText("邀請已送出", { exact: true })).toBeVisible();
  expect((await page.evaluate(() => window.__inviteCalls))[0]).toContain("session-id-injection");

  await page.evaluate(async () => {
    const views = await window.__importAppModule("sessionViews");
    views.openPlayerCardSheet?.(
      { profileId: 92, nickname: "錯誤球友", ntrp: 4, playTypes: [], slotCodes: [], courtName: "大佳", courtDistrict: "中山區", isSelf: false },
      { myInvitableSessions: [{ sessionId: 72, startAt: "2030-01-01T01:00:00.000Z", court: "大佳", courtDistrict: "中山區", playType: "雙打", notes: "" }], onInvite: async () => { throw new Error("邀請遭拒"); } }
    );
  });
  await page.getByTestId("player-invite-session").check();
  await page.getByTestId("player-invite-submit").click();
  await expect(page.locator("#player-card-sheet [role='alert']")).toHaveText("邀請遭拒");
  await expect(page.getByTestId("player-invite-submit")).toBeEnabled();

  await page.evaluate(async () => {
    const views = await window.__importAppModule("sessionViews");
    window.__staleInvite = {};
    const promise = new Promise((resolve) => { window.__staleInvite.resolve = resolve; });
    views.openPlayerCardSheet?.(
      { profileId: 93, nickname: "晚到球友", ntrp: 3, playTypes: [], slotCodes: [], courtName: "大佳", courtDistrict: "中山區", isSelf: false },
      { myInvitableSessions: [{ sessionId: 73, startAt: "2030-01-01T01:00:00.000Z", court: "大佳", courtDistrict: "中山區", playType: "雙打", notes: "" }], onInvite: () => promise }
    );
  });
  await page.getByTestId("player-invite-session").check();
  await page.getByTestId("player-invite-submit").click();
  await page.evaluate(async () => {
    const views = await window.__importAppModule("sessionViews");
    views.openCourtPlayersDrawer?.({ id: 8, name: "替代球場", district: "大安區" }, []);
    window.__staleInvite.resolve({ outcome: "OK" });
  });
  await expect(page.locator("#court-players-sheet")).toBeVisible();
  await expect(page.getByText("邀請已送出", { exact: true })).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("SESSION_EXPIRED player invitation refreshes choices and renders an inline error instead of success", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { createSessionController } = await window.__importAppModule("sessionController");
    const views = await window.__importAppModule("sessionViews");
    const hostSession = {
      sessionId: 71,
      viewerRole: "host",
      status: "open",
      startAt: "2030-01-01T01:00:00.000Z",
      court: "大佳",
      courtDistrict: "中山區",
      playType: "雙打",
      notes: "測試邀請",
    };
    const player = {
      profileId: 91,
      nickname: "可邀球友",
      ntrp: 4,
      playTypes: ["雙打"],
      slotCodes: ["we-a"],
      courtId: 8,
      courtName: "大佳",
      courtDistrict: "中山區",
      courtLat: 25.03,
      courtLng: 121.54,
      isSelf: false,
    };
    let mySessionLoads = 0;
    const controller = createSessionController({
      api: {
        inviteToSession: async () => ({ outcome: "SESSION_EXPIRED", reloadRequired: true }),
        loadMySessions: async () => (++mySessionLoads === 1 ? [hostSession] : []),
        loadPlayerPresenceDirectory: async () => [player],
      },
      openCourtPlayersDrawer: views.openCourtPlayersDrawer,
      openPlayerCard: views.openPlayerCardSheet,
    });
    await controller.setAuthState({ user: { id: "host" } }, { directory: true, nickname: true, ntrp: true });
    await controller.togglePlayerLayer();
    const group = controller.getPlayerLayerState().groups[0];
    controller.openPlayerCourt(group.court, group.players);
    window.__expiredInviteSessionLoads = () => mySessionLoads;
  });

  await page.locator("[data-player-id]").click();
  await page.getByTestId("player-invite-session").check();
  await page.getByTestId("player-invite-submit").click();
  await expect(page.locator("#player-card-sheet")).toBeVisible();
  await expect(page.locator("#player-card-sheet [role='alert']")).toContainText("球局狀態已更新");
  await expect(page.getByText("邀請已送出", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("player-invite-session")).toHaveCount(0);
  expect(await page.evaluate(() => window.__expiredInviteSessionLoads())).toBe(2);
  expect(runtimeErrors).toEqual([]);
});

test("390px map controls keep the player layer and status below the toolbar", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakeMaps(page);
  await page.goto("/");
  // 先等 app 開機完成(map ready+peek 出現)再覆寫狀態:否則較慢的開機 publish
  // 會把測試手動設定的 status 蓋回 hidden,boundingBox 變 null(全套件下的間歇紅)。
  await expect(page.locator("#map")).toHaveAttribute("data-fake-google-map", "ready");
  await expect(page.locator("#nearby-sessions-toggle")).toBeVisible();
  await page.evaluate(async () => {
    const { renderPlayerLayerToggle } = await window.__importAppModule("sessionViews");
    renderPlayerLayerToggle(document.getElementById("player-layer-toggle"), {
      message: "球友資料暫時無法載入。",
      on: true,
      status: "error",
    });
    const mapStatus = document.getElementById("map-data-status");
    mapStatus.hidden = false;
    mapStatus.textContent = "球局資料暫時無法載入。";
  });
  const toolbar = await page.locator(".map-toolbar").boundingBox();
  const playerControl = await page.locator(".player-layer-control").boundingBox();
  const mapStatus = await page.locator("#map-data-status").boundingBox();
  // gap token 是 8px,但字體載入時序會讓分數像素進位差到整整 1px(實測 7.0)——
  // 容差取 2px:守「下方且有間距」的迴歸(重疊時 gap ≤0),不守像素精度。
  expect(playerControl.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height + 6);
  expect(mapStatus.y).toBeGreaterThanOrEqual(playerControl.y + playerControl.height + 6);
  expect(runtimeErrors).toEqual([]);
});

// 批 D4a:六顆 chip(今天/明天/週末/程度/直接加入/篩選)在 390px 下本就寬於視窗,
// dc L100 的設計是靠 overflow-x:auto 橫向捲動容納,不是全部擠進單一可視寬度——
// 「篩選 chip 一開始就完整落在 toolbar 可視框內」不再是這個版面的不變量,改驗證
// 「捲到底可以捲到篩選 chip」這個新的、真正對應橫向捲動設計的不變量。
test("390px toolbar contains its content, never intersects the following controls, and can scroll to reveal the filter chip", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakeMaps(page);
  await page.goto("/");

  const layout = await page.evaluate(() => {
    const toolbar = document.querySelector(".map-toolbar");
    const playerControl = document.querySelector(".player-layer-control");
    const toolbarRect = toolbar.getBoundingClientRect();
    const playerRect = playerControl.getBoundingClientRect();
    const canScrollToFilterChip = toolbar.scrollWidth > toolbar.clientWidth;
    toolbar.scrollLeft = toolbar.scrollWidth;
    const primaryButtonRect = document.querySelector("#filter-sheet-open").getBoundingClientRect();
    return {
      contentFits: toolbar.scrollHeight <= toolbar.clientHeight,
      canScrollToFilterChip,
      primaryButtonInsideAfterScroll:
        primaryButtonRect.top >= toolbarRect.top &&
        primaryButtonRect.right <= toolbarRect.right + 1 &&
        primaryButtonRect.bottom <= toolbarRect.bottom &&
        primaryButtonRect.left >= toolbarRect.left,
      toolbarIntersectsPlayer:
        toolbarRect.left < playerRect.right &&
        toolbarRect.right > playerRect.left &&
        toolbarRect.top < playerRect.bottom &&
        toolbarRect.bottom > playerRect.top,
    };
  });
  expect(layout.contentFits).toBe(true);
  expect(layout.canScrollToFilterChip, "six chips must overflow a 390px viewport for this test to prove anything").toBe(true);
  expect(layout.primaryButtonInsideAfterScroll).toBe(true);
  expect(layout.toolbarIntersectsPlayer).toBe(false);
  expect(runtimeErrors).toEqual([]);
});

// 批 D4a:.player-layer-actions 容器已隨 #player-directory-open 移入頂列 row1
// 而清空(見 index.html 註記),原本的掃描目標改為 row1 本身(品牌磚連結＋球友
// 名單鈕)。
test("390px topbar row1 actions are at least 44px", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakeMaps(page);
  await page.goto("/");

  for (const targets of [page.locator(".map-topbar__row a, .map-topbar__row button")]) {
    const count = await targets.count();
    expect(count, "the app-owned touch-target scan must be nonempty").toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await targets.nth(index).boundingBox();
      // mobile DPR 縮放下 boundingBox 有 2^-15 級定點數噪音(實測 43.999969…),
      // epsilon 只吃掉次像素噪音,真實 <44px 的目標仍會紅。
      expect(box.width).toBeGreaterThanOrEqual(44 - 0.001);
      expect(box.height).toBeGreaterThanOrEqual(44 - 0.001);
    }
  }
  await page.getByTestId("me-tab").click();
  const serviceLinks = page.locator(".me-service-links a");
  const serviceLinkCount = await serviceLinks.count();
  expect(serviceLinkCount, "the Me service-link touch-target scan must be nonempty").toBeGreaterThan(0);
  for (let index = 0; index < serviceLinkCount; index += 1) {
    const box = await serviceLinks.nth(index).boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  expect(runtimeErrors).toEqual([]);
});

test("390px primary map, filter, and chat governance targets are at least 44px", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openSessionChatSheet } = await window.__importAppModule("sessionViews");
    const chat = openSessionChatSheet({
      court: "青年公園網球場",
      courtDistrict: "萬華區",
      playType: "雙打",
      sessionId: 8812,
      startAt: "2099-07-19T01:00:00.000Z",
      status: "open",
    });
    chat.setState({
      messages: [
        {
          body: "一起打球",
          createdAt: "2099-07-18T01:00:00.000Z",
          isSelf: false,
          kind: "user",
          messageId: 1,
          senderNickname: "受測球友",
          senderProfileId: 991,
        },
      ],
      status: "ready",
    });
  });

  const targetGroups = [
    // 批 D4a:.app-header__actions(僅含「使用我的位置」)退場,原鈕移入
    // #map-zoom-controls,直欄四鈕本就恆為 44px(不分斷點),沿用同一個掃描目標。
    page.locator("#map-zoom-controls button"),
    page.locator(".map-toolbar .filter-chip"),
    page.locator(".chat-message__meta :is([data-chat-report], [data-chat-block])"),
  ];
  for (const targets of targetGroups) {
    const count = await targets.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await targets.nth(index).boundingBox();
      // mobile DPR 縮放下 boundingBox 有 2^-15 級定點數噪音(實測 43.999969…),
      // epsilon 只吃掉次像素噪音,真實 <44px 的目標仍會紅。
      expect(box.width).toBeGreaterThanOrEqual(44 - 0.001);
      expect(box.height).toBeGreaterThanOrEqual(44 - 0.001);
    }
  }
  expect(runtimeErrors).toEqual([]);
});

test("medium-width map status stays below the complete player layer control", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await page.setViewportSize({ width: 550, height: 844 });
  await installFakeMaps(page);
  await page.goto("/");
  // 同 390px 版:先等開機 publish 落定再覆寫,避免測試手動狀態被蓋掉的間歇紅。
  await expect(page.locator("#map")).toHaveAttribute("data-fake-google-map", "ready");
  await expect(page.locator("#nearby-sessions-toggle")).toBeVisible();
  await page.evaluate(async () => {
    const { renderPlayerLayerToggle } = await window.__importAppModule("sessionViews");
    renderPlayerLayerToggle(document.getElementById("player-layer-toggle"), {
      message: "球友資料暫時無法載入。",
      on: true,
      status: "error",
    });
    const mapStatus = document.getElementById("map-data-status");
    mapStatus.hidden = false;
    mapStatus.textContent = "球局資料暫時無法載入。";
  });

  const playerControl = await page.locator(".player-layer-control").boundingBox();
  const mapStatus = await page.locator("#map-data-status").boundingBox();
  // 同 390px 版:字體時序的整像素進位差,容差 2px。
  expect(mapStatus.y).toBeGreaterThanOrEqual(playerControl.y + playerControl.height + 6);
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
  await primary.focus();
  // Mock mode deliberately does not expose an OAuth entry point. Exercise the
  // reusable nested modal primitive directly so its focus/failed-provider
  // behavior remains covered without contradicting that product rule.
  await page.evaluate(async () => {
    const { openLoginModal } = await window.__importAppModule("sheets");
    openLoginModal({ onProvider: async () => Promise.reject(new Error("forced provider failure")) });
  });
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

test("the login modal hides LINE by default and passes the custom provider id through when enabled", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  // 預設(mock webServer 未設 VITE_AUTH_LINE_PROVIDER_ID)只有 Google 一顆按鈕。
  await page.evaluate(async () => {
    const { openLoginModal } = await window.__importAppModule("sheets");
    openLoginModal({});
  });
  await expect(page.locator("#login-dialog [data-provider]")).toHaveCount(1);
  await expect(page.locator("#login-dialog [data-provider='google']")).toBeVisible();
  // 未啟用 LINE 時,不出現「各自獨立帳號」的說明文案。
  await expect(page.locator("#login-dialog")).not.toContainText("各自獨立的帳號");
  await page.keyboard.press("Escape");
  await expect(page.locator("#login-dialog")).toHaveCount(0);

  // 顯式開啟後有兩顆;點 LINE 要把 custom provider 識別符原樣傳給 onProvider。
  await page.evaluate(async () => {
    const { openLoginModal } = await window.__importAppModule("sheets");
    window.__providerCalls = [];
    openLoginModal({
      lineProviderId: "custom:line",
      onProvider: async (provider) => {
        window.__providerCalls.push(provider);
      },
    });
  });
  await expect(page.locator("#login-dialog [data-provider]")).toHaveCount(2);
  // 啟用 LINE 時,同步出現獨立帳號+可連結的說明文案。
  await expect(page.locator("#login-dialog")).toContainText("各自獨立的帳號");
  const lineButton = page.locator("#login-dialog [data-provider='custom:line']");
  await expect(lineButton).toHaveText("使用 LINE 登入");
  await lineButton.click();
  await expect(page.locator("[data-login-message]")).toContainText("正在前往登入頁");
  expect(await page.evaluate(() => window.__providerCalls)).toEqual(["custom:line"]);
  await page.keyboard.press("Escape");
  await expect(page.locator("#login-dialog")).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("the Me page login methods list hides LINE without a provider id and wires linking", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const renderLoginMethods = async (options) => {
    await page.evaluate(async ({ linkedProviders, lineProviderId }) => {
      const { renderMePage } = await window.__importAppModule("sessionViews");
      document.getElementById("tab-map").hidden = true;
      document.getElementById("me-page").hidden = false;
      window.__linkCalls = window.__linkCalls ?? [];
      renderMePage(document.getElementById("me-root"), {
        authSession: { user: { id: "login-methods-test" } },
        profile: { nick: "測試球友", ntrp: 3.5 },
        linkedProviders,
        lineProviderId,
        onLinkProvider: async (provider) => {
          window.__linkCalls.push(provider);
        },
      });
    }, options);
  };

  // Google 已連結、LINE 未連結:LINE 列出現連結按鈕,點擊把 provider 識別符原樣傳給 onLinkProvider。
  await renderLoginMethods({ linkedProviders: ["google"], lineProviderId: "custom:line" });
  await expect(page.locator("[data-login-method]")).toHaveCount(2);
  await expect(page.locator("[data-login-method='google'] .me-login-method__status")).toHaveText("已連結");
  const lineLinkButton = page.locator("[data-link-provider='custom:line']");
  await expect(lineLinkButton).toBeVisible();
  await lineLinkButton.click();
  expect(await page.evaluate(() => window.__linkCalls)).toEqual(["custom:line"]);

  // 未設定 provider 識別符:只剩 Google 一列(部署端未開 LINE 前不得出現 LINE 字樣)。
  await renderLoginMethods({ linkedProviders: ["google"], lineProviderId: "" });
  await expect(page.locator("[data-login-method]")).toHaveCount(1);
  await expect(page.locator("#me-root")).not.toContainText("LINE");

  // 兩者都已連結:沒有任何連結按鈕。
  await renderLoginMethods({ linkedProviders: ["google", "custom:line"], lineProviderId: "custom:line" });
  await expect(page.locator("[data-login-method]")).toHaveCount(2);
  await expect(page.locator("[data-link-provider]")).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("the login modal titles each gate entry point instead of always naming a join request", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const openLoginFor = async (action) => {
    await page.evaluate(async (nextAction) => {
      const { openLoginModal } = await window.__importAppModule("sheets");
      openLoginModal(nextAction === null ? {} : { action: nextAction });
    }, action);
  };

  for (const [action, title] of [
    ["join", "登入以申請加入球局"],
    ["create", "登入以開球局"],
    ["players", "登入以查看在線球友"],
    ["directory", "登入以查看球友名單"],
    ["my-sessions", "登入以查看你的球局"],
    ["me", "登入以管理你的檔案與設定"],
    [null, "登入以繼續"],
  ]) {
    await openLoginFor(action);
    await expect(page.locator("#login-dialog h2")).toHaveText(title);
    await page.keyboard.press("Escape");
    await expect(page.locator("#login-dialog")).toHaveCount(0);
  }
  expect(runtimeErrors).toEqual([]);
});

test("a session without an NTRP range reads as unrestricted rather than NTRP 0.0", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const openRangeless = page.getByRole("button", { name: /地圖圖釘 球局 · 彩虹河濱公園網球場/ });
  await openRangeless.click();
  const details = page.locator("#session-sheet [data-session-field='details']");
  await expect(details).toContainText("NTRP 不限");
  await expect(details).not.toContainText("NTRP 0.0");
  expect(runtimeErrors).toEqual([]);
});

test("profile and create sheets disclose public nickname use and retain a local-demo create failure", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
    openProfileCompletionSheet({
      courts: [{ city: "台北市", id: 8, name: "示範球場" }],
      profile: { courts: new Set(), nick: "", ntrp: 3.5, slots: new Set(["we-m"]), types: new Set() },
      returnSession: { court: "示範球場", startAt: "2026-07-18T01:30:00.000Z" },
    });
  });

  const disclosure =
    "開球局後，這個暱稱與你的 NTRP 會顯示給瀏覽該球局的人；加入球局後，主揪與已接受球友可使用球局群組聊天。";
  // 兩個掛載點都比對「模組匯出的那一份」,任何一處寫死成不同文字都會紅。
  const ntrpExplanation = await page.evaluate(
    async () => (await window.__importAppModule("sessionViews")).NTRP_SCALE_EXPLANATION
  );
  expect(ntrpExplanation).toContain("NTRP 是網球程度自評分級");
  const profile = page.locator("#profile-completion-sheet");
  await expect(profile).toBeVisible();
  await expect(profile.getByLabel("公開暱稱")).toBeVisible();
  await expect(profile.getByText(disclosure)).toBeVisible();
  await expect(profile.locator("[data-ntrp-explanation]")).toHaveText(ntrpExplanation);
  await expect(profile).toContainText("完成後將回到：示範球場・");
  await page.keyboard.press("Escape");

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await window.__importAppModule("sessionViews");
    openCreateSessionSheet({
      courts: [{ city: "台北市", id: 8, name: "示範球場" }],
      onSubmit: async () => {
        throw new Error("本機示範資料僅供瀏覽；登入、儲存個人檔案與建立球局需在已設定服務的環境使用。");
      },
    });
  });

  const createSheet = page.locator("#session-create-modal");
  const form = createSheet.getByTestId("session-form");
  await expect(createSheet).toBeVisible();
  await expect(page.getByTestId("session-create-modal")).toBeVisible();
  await expect(createSheet.getByText(disclosure)).toBeVisible();
  await expect(createSheet.locator("[data-ntrp-explanation]")).toHaveText(ntrpExplanation);
  // 批 D5:「直接加入」原生 radio 退場,改 toggle-switch,預設仍是開(instant)。
  await expect(form.getByTestId("create-instant-toggle")).toHaveAttribute("aria-checked", "true");
  await expect(createSheet).toContainText(
    "選擇直接加入後，已填暱稱且 NTRP 符合球局範圍的球友會直接加入；未填 NTRP 或超出範圍者會改為申請，由你審核。加入後可在球局群組聊天協調。"
  );

  // 批 D5:「現在開打」移入時間 chips 列首,仍寫回同一顆 session-start-at(現為
  // hidden input),語意不變。
  await form.getByTestId("session-now-start").click();
  await expect(form.getByTestId("session-start-at")).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

  await form.getByTestId("create-court-8").click();
  await form.getByTestId("create-date-custom").click();
  await form.getByTestId("create-date-custom-input").fill("2099-07-18");
  await form.getByTestId("create-time-09:00").click();
  await form.getByTestId("create-play-type-單打").click();
  await form.getByTestId("session-submit").click();
  await expect(form.getByRole("alert")).toContainText("本機示範資料僅供瀏覽");
  await expect(createSheet).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

// 迴歸(2026-08-17 實機回報,iPhone Safari 與 S23 Chrome 皆中):手機可視高度約 664px
// (瀏覽器工具列吃掉之後)且球場目錄滿載 61 座時,球場格內捲吃滿首屏,日期卡整張被推進
// sticky footer 遮蔽區;內捲又攔走外層捲動手勢,日期完全選不到。守住兩件事:
// (1)首屏第一顆日期 chip 整顆落在 footer 上緣之上,不捲動就點得到;
// (2)點「自訂」展開的日期輸入框整顆在遮蔽區之外(scroll-padding 讓 scrollIntoView 認得 footer)。
test("the create form keeps date controls reachable above the sticky footer at phone height with a full catalogue", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await window.__importAppModule("sessionViews");
    openCreateSessionSheet({
      courts: Array.from({ length: 61 }, (_, index) => ({ city: "台北市", id: index + 1, name: `示範球場 ${index + 1}` })),
      onSubmit: async () => {
        throw new Error("本機示範資料僅供瀏覽；登入、儲存個人檔案與建立球局需在已設定服務的環境使用。");
      },
    });
  });

  const sheet = page.locator("#session-create-modal");
  await expect(sheet).toBeVisible();
  const footerTop = async () => (await sheet.locator(".create-v2__footer").boundingBox()).y;

  // (1) 進場動畫結束後,第一顆日期 chip(今天)要整顆在 footer 上緣之上。
  const firstDateChip = sheet.locator('[data-role="date"]').first();
  await expect
    .poll(async () => {
      const chip = await firstDateChip.boundingBox();
      return chip ? chip.y + chip.height - (await footerTop()) : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(0);

  // chip 真的收得到點擊(被 footer 的 disclosure 蓋住時,actionability 檢查會逾時)。
  await firstDateChip.click();

  // (2) 展開自訂日期後,輸入框整顆要在遮蔽區之外。
  await sheet.getByTestId("create-date-custom").click();
  const customInput = sheet.getByTestId("create-date-custom-input");
  await expect(customInput).toBeVisible();
  await expect
    .poll(async () => {
      const input = await customInput.boundingBox();
      return input ? input.y + input.height - (await footerTop()) : Number.POSITIVE_INFINITY;
    })
    .toBeLessThanOrEqual(0);

  // (3) footer 必須錨定視窗底:捲動表單時不得跟著內容漂移(本次實機回報的主因——
  // scroller 曾是定位祖先,footer 捲動後浮到畫面中段蓋住日期卡)。
  const anchoredFooterTop = await footerTop();
  await sheet.locator(".create-v2__scroll").evaluate((element) => {
    element.scrollTop = 200;
  });
  await expect.poll(async () => Math.round(await footerTop())).toBe(Math.round(anchoredFooterTop));
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions gives accepted members chat access without rendering retired contact controls", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    const session = {
      court: "青年公園網球場",
      courtDistrict: "萬華區",
      hostNickname: "聯絡主揪",
      hostNtrp: 3.5,
      ntrpMax: 4,
      ntrpMin: 3,
      playType: "單打",
      sessionId: 739,
      slotsRemaining: 1,
      startAt: "2099-07-19T01:00:00.000Z",
      status: "open",
      viewerParticipantStatus: "accepted",
      viewerRole: "host",
    };
    renderMySessionsPage(root, {
      authenticated: true,
      groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [session] },
    });
  });

  // 批 D6:viewerRole host 的 upcoming 卡只在「我主揪的」分頁,預設分頁是「我報名的」。
  await page.getByTestId("my-sessions-seg-hosted").click();
  await expect(page.getByTestId("open-chat-739")).toBeVisible();
  await expect(page.locator("[data-copy-contact]")).toHaveCount(0);
  await expect(page.locator(".my-session-contacts")).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions chat button surfaces an unread count without disturbing the zero-state label", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    const baseSession = {
      court: "青年公園網球場",
      courtDistrict: "萬華區",
      hostNickname: "聯絡主揪",
      hostNtrp: 3.5,
      ntrpMax: 4,
      ntrpMin: 3,
      playType: "單打",
      slotsRemaining: 1,
      startAt: "2099-07-19T01:00:00.000Z",
      status: "open",
      viewerParticipantStatus: "accepted",
      viewerRole: "host",
    };
    renderMySessionsPage(root, {
      authenticated: true,
      groups: {
        history: [],
        needsAction: [],
        needsActionCount: 0,
        upcoming: [
          { ...baseSession, sessionId: 741, unreadMessageCount: 3 },
          { ...baseSession, sessionId: 742, unreadMessageCount: 0 },
        ],
      },
    });
  });

  // 批 D6:viewerRole host 的 upcoming 卡只在「我主揪的」分頁,預設分頁是「我報名的」。
  await page.getByTestId("my-sessions-seg-hosted").click();
  const unreadButton = page.getByTestId("open-chat-741");
  await expect(unreadButton).toHaveText("群組聊天（3）");
  await expect(unreadButton).toHaveAttribute("aria-label", "群組聊天，3 則未讀訊息");

  const readButton = page.getByTestId("open-chat-742");
  await expect(readButton).toHaveText("群組聊天");
  await expect(readButton).not.toHaveAttribute("aria-label");
  expect(runtimeErrors).toEqual([]);
});

test("a host request card names an absent NTRP instead of displaying NTRP 0.0", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    renderMySessionsPage(root, {
      authenticated: true,
      groups: {
        history: [],
        needsAction: [
          {
            kind: "host-request",
            participant: {
              homeCourts: [],
              nickname: "未填程度球友",
              ntrp: null,
              participantId: 95,
              playTypes: [],
              profileId: 96,
            },
            session: {
              court: "青年公園網球場",
              hostNickname: "本人",
              hostNtrp: 4,
              ntrpMax: 5,
              ntrpMin: 3,
              playType: "雙打",
              sessionId: 740,
              startAt: "2099-07-19T01:00:00.000Z",
            },
          },
        ],
        needsActionCount: 1,
        upcoming: [],
      },
    });
  });

  // 批 D6:kind:"host-request" 恆為「我主揪的」分頁,預設分頁是「我報名的」;
  // session 補上 playType/host 欄位——薄卡列(mySessionBriefMarkup)的 meta 行會
  // 讀這些欄位,缺值會讓 template literal 印出字面「undefined」。
  await page.getByTestId("my-sessions-seg-hosted").click();
  const request = page.getByTestId("participant-row");
  await expect(request).toContainText("未填程度球友 · 尚未填寫 NTRP");
  await expect(request).not.toContainText("NTRP 0.0");
  expect(runtimeErrors).toEqual([]);
});

test("profile completion explains targeted gate requirements", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
    openProfileCompletionSheet({ intent: { action: "create" }, profile: { courts: new Set(), nick: "", ntrp: null, slots: new Set(), types: new Set() } });
  });
  const createProfile = page.locator("#profile-completion-sheet");
  await expect(createProfile).toContainText("要開球局，請填寫公開暱稱與 NTRP（1.0–7.0）。");
  await expect(createProfile.getByLabel("公開暱稱")).toBeVisible();
  await expect(createProfile.getByLabel(/NTRP 程度/)).toBeVisible();
  await expect(createProfile.getByRole("group", { name: "常打球場" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
    openProfileCompletionSheet({
      intent: { action: "create" },
      profile: { courts: new Set(), nick: "已有暱稱", ntrp: null, slots: new Set(), types: new Set() },
    });
  });
  const ntrpOnlyProfile = page.locator("#profile-completion-sheet");
  await expect(ntrpOnlyProfile.getByLabel("公開暱稱")).toHaveCount(0);
  await expect(ntrpOnlyProfile.getByLabel(/NTRP 程度/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
    openProfileCompletionSheet({ intent: { action: "players" }, profile: { courts: new Set(), nick: "", ntrp: null, slots: new Set(), types: new Set() } });
  });
  await expect(page.locator("#profile-completion-sheet")).toContainText(
    "要查看在線球友，請填寫公開暱稱與 NTRP（1.0–7.0）。"
  );
  await page.keyboard.press("Escape");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
    openProfileCompletionSheet({ intent: { action: "directory" }, profile: { courts: new Set(), nick: "", ntrp: null, slots: new Set(), types: new Set() } });
  });
  await expect(page.locator("#profile-completion-sheet")).toContainText(
    "要使用球友目錄或公開球友卡，請填寫公開暱稱、NTRP（1.0–7.0），並選擇至少一座台北市常打球場。"
  );
  await page.keyboard.press("Escape");
  expect(runtimeErrors).toEqual([]);
});

test("create sheet submits a walk-on session with one authoritative court", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await window.__importAppModule("sessionViews");
    window.__walkOnCreatePayload = null;
    openCreateSessionSheet({
      courts: [{ city: "台北市", district: "大安區", id: 8, name: "示範球場" }],
      onSubmit: async (payload) => {
        window.__walkOnCreatePayload = payload;
      },
    });
  });

  // 批 D5:session-venue-walk-on 錨點退場(已定/候選 segmented 只剩兩鍵,
  // 已訂場/走場改由單一 toggle 表達)。walk_on = fixed 模式 + 已訂場 toggle
  // 保持關閉(預設態),所以這裡完全不用碰 toggle;下一行直接斷言它仍是關閉的,
  // 確認「什麼都不點就是 walk_on」這個推導路徑。
  const form = page.getByTestId("session-form");
  await expect(form.getByTestId("session-venue-booked")).toHaveAttribute("aria-checked", "false");
  await expect(form.getByTestId("session-court")).toBeVisible();
  await expect(form.getByTestId("session-candidate-courts")).toBeHidden();
  await form.getByTestId("create-court-8").click();
  await form.getByTestId("create-date-custom").click();
  await form.getByTestId("create-date-custom-input").fill("2099-07-18");
  await form.getByTestId("create-time-09:00").click();
  await form.getByTestId("session-submit").click();

  await expect.poll(() => page.evaluate(() => window.__walkOnCreatePayload)).toMatchObject({
    candidateCourtIds: null,
    courtId: 8,
    joinMode: "instant",
    playType: "雙打",
    rangeEnd: null,
    slotsTotal: 2,
    startAt: "2099-07-18T01:00:00.000Z",
    venueType: "walk_on",
  });
  expect(runtimeErrors).toEqual([]);
});

test("create sheet submits sensible defaults when only a court and start time are chosen", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await window.__importAppModule("sessionViews");
    window.__collapsedCreatePayload = null;
    openCreateSessionSheet({
      courts: [{ city: "台北市", district: "大安區", id: 8, name: "示範球場" }],
      onSubmit: async (payload) => {
        window.__collapsedCreatePayload = payload;
      },
    });
  });

  // 批 D5:「進階設定」收合區退場,NTRP 改「找的程度」chips(預設「不限」)、
  // 打法 chips(預設「雙打」)、缺額 stepper(預設 2)——除了球場與時間,其餘皆有
  // 產品預設值,不點也送得出合法 payload。
  const form = page.getByTestId("session-form");
  await form.getByTestId("create-court-8").click();
  await form.getByTestId("create-date-custom").click();
  await form.getByTestId("create-date-custom-input").fill("2099-07-18");
  await form.getByTestId("create-time-09:00").click();
  await form.getByTestId("session-submit").click();

  await expect.poll(() => page.evaluate(() => window.__collapsedCreatePayload)).toMatchObject({
    feeNote: null,
    joinMode: "instant",
    notes: null,
    ntrpMax: null,
    ntrpMin: null,
    playType: "雙打",
    slotsTotal: 2,
    venueType: "walk_on",
  });
  expect(runtimeErrors).toEqual([]);
});

test("create sheet switches to candidate mode and submits up to three candidate courts as an array", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await window.__importAppModule("sessionViews");
    window.__stage4bCreatePayload = null;
    window.__stage4bToasts = [];
    openCreateSessionSheet({
      courts: [
        { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
        { city: "台北市", district: "中山區", id: 9, name: "第二球場" },
        { city: "台北市", district: "萬華區", id: 10, name: "第三球場" },
        { city: "台北市", district: "松山區", id: 11, name: "第四球場" },
      ],
      onSubmit: async (payload) => {
        window.__stage4bCreatePayload = payload;
      },
      toast: (message) => window.__stage4bToasts.push(message),
    });
  });

  const sheet = page.locator("#session-create-modal");
  const form = sheet.getByTestId("session-form");
  await expect(form.getByTestId("create-mode-fixed")).toHaveAttribute("aria-pressed", "true");
  await expect(form.getByTestId("session-court")).toBeVisible();
  await expect(form.getByTestId("session-candidate-courts")).toBeHidden();

  // 批 D5:候選模式改由 segmented「先列候選」單鍵切換(session-venue-candidates
  // 錨點改掛在這顆鈕上),不再是三值 radio 之一。
  await form.getByTestId("session-venue-candidates").click();
  await expect(form.getByTestId("session-venue-candidates")).toHaveAttribute("aria-pressed", "true");
  await expect(form.getByTestId("session-court")).toBeHidden();
  await expect(form.getByTestId("session-candidate-courts")).toBeVisible();

  await form.getByTestId("create-candidate-court-8").click();
  await form.getByTestId("create-candidate-court-9").click();
  await form.getByTestId("create-candidate-court-10").click();
  // 已選滿 3 座後再點第 4 座:擋下並丟 toast,不動既有 3 個選取(dc §2 上限規則)。
  await form.getByTestId("create-candidate-court-11").click();
  await expect.poll(() => page.evaluate(() => window.__stage4bToasts)).toEqual(["候選最多 3 個"]);
  await expect(form.getByTestId("create-candidate-court-11")).not.toHaveClass(/is-selected/);
  await form.getByTestId("create-date-custom").click();
  await form.getByTestId("create-date-custom-input").fill("2099-07-18");
  await form.getByTestId("create-slot-afternoon").click();
  // 缺幾位 stepper:+1 到 3 再 −1 回 2,證明 stepper 本身可雙向運作。
  await form.getByTestId("create-need-plus").click();
  await expect(form.getByTestId("create-need-value")).toHaveText("3");
  await form.getByTestId("create-need-minus").click();
  await expect(form.getByTestId("create-need-value")).toHaveText("2");
  await form.getByTestId("session-fee-note").fill("每人 150 元");
  await form.getByTestId("session-submit").click();

  await expect.poll(() => page.evaluate(() => window.__stage4bCreatePayload)).toMatchObject({
    candidateCourtIds: [8, 9, 10],
    courtId: null,
    feeNote: "每人 150 元",
    rangeEnd: "2099-07-18T09:00:00.000Z",
    slotsTotal: 2,
    venueType: "candidates",
  });
  expect(runtimeErrors).toEqual([]);
});

test("create sheet blocks publish with guidance toast until the venue requirement is met", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await window.__importAppModule("sessionViews");
    window.__blockedToasts = [];
    window.__blockedSubmitCount = 0;
    openCreateSessionSheet({
      courts: [{ city: "台北市", district: "大安區", id: 8, name: "示範球場" }],
      onSubmit: async () => {
        window.__blockedSubmitCount += 1;
      },
      toast: (message) => window.__blockedToasts.push(message),
    });
  });

  // 批 D5 決策 13:底鈕沒有 native disabled,未完成點擊只由 toast 引導,submit
  // 事件本身不可觸發 onSubmit。這裡完全不選球場/時間就點發布。
  const form = page.getByTestId("session-form");
  await form.getByTestId("session-submit").click();
  await expect.poll(() => page.evaluate(() => window.__blockedToasts)).toEqual(["先選好球場與開始時間"]);
  expect(await page.evaluate(() => window.__blockedSubmitCount)).toBe(0);

  await form.getByTestId("session-venue-candidates").click();
  await form.getByTestId("session-submit").click();
  await expect.poll(() => page.evaluate(() => window.__blockedToasts)).toEqual([
    "先選好球場與開始時間",
    "先選 2–3 個候選球場與時段",
  ]);
  expect(await page.evaluate(() => window.__blockedSubmitCount)).toBe(0);
  expect(runtimeErrors).toEqual([]);
});

test("create sheet switches to its own success page after publish and routes 查看我的球局 through onViewMySessions", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await window.__importAppModule("sessionViews");
    window.__viewMySessionsCalls = [];
    openCreateSessionSheet({
      courts: [{ city: "台北市", district: "大安區", id: 8, name: "示範球場" }],
      onSubmit: async () => ({ sessionId: 555 }),
      onViewMySessions: (sessionId) => window.__viewMySessionsCalls.push(sessionId),
    });
  });

  const sheet = page.locator("#session-create-modal");
  const form = sheet.getByTestId("session-form");
  await form.getByTestId("create-court-8").click();
  await form.getByTestId("create-date-custom").click();
  await form.getByTestId("create-date-custom-input").fill("2099-07-18");
  await form.getByTestId("create-time-19:00").click();
  await form.getByTestId("session-submit").click();

  // 批 D5 決策 14:成功後 sheet 不自動關閉,改在同一張 sheet 內切到成功頁。
  await expect(form).toBeHidden();
  const doneTitle = sheet.getByTestId("create-done-title");
  await expect(doneTitle).toBeVisible();
  await expect(doneTitle).toBeFocused();
  await expect(sheet.getByTestId("create-done-card")).toContainText("示範球場");
  await expect(sheet.getByTestId("create-done-card")).toContainText("雙打");
  await expect(sheet.getByTestId("create-done-card")).toContainText("缺 2");
  await expect(sheet.getByTestId("create-done-card")).toContainText("19:00");

  await sheet.getByTestId("create-done-view-my-sessions").click();
  await expect(sheet).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__viewMySessionsCalls)).toEqual([555]);
  expect(runtimeErrors).toEqual([]);
});

test("create sheet success page's 回到地圖 closes without triggering My Sessions navigation", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await window.__importAppModule("sessionViews");
    window.__viewMySessionsCalls = [];
    openCreateSessionSheet({
      courts: [{ city: "台北市", district: "大安區", id: 8, name: "示範球場" }],
      onSubmit: async () => ({ sessionId: 556 }),
      onViewMySessions: (sessionId) => window.__viewMySessionsCalls.push(sessionId),
    });
  });

  const sheet = page.locator("#session-create-modal");
  const form = sheet.getByTestId("session-form");
  await form.getByTestId("create-court-8").click();
  await form.getByTestId("create-date-custom").click();
  await form.getByTestId("create-date-custom-input").fill("2099-07-18");
  await form.getByTestId("create-time-19:00").click();
  await form.getByTestId("session-submit").click();
  await expect(sheet.getByTestId("create-done-title")).toBeVisible();

  await sheet.getByTestId("create-done-back-to-map").click();
  await expect(sheet).toBeHidden();
  expect(await page.evaluate(() => window.__viewMySessionsCalls)).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test("an existing one-decimal NTRP can save a nickname-only edit unchanged", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
    window.__savedOneDecimalProfile = null;
    openProfileCompletionSheet({
      onSave: async (draft) => {
        window.__savedOneDecimalProfile = { nick: draft.nick, ntrp: draft.ntrp };
        return draft;
      },
      profile: { courts: new Set(), nick: "原暱稱", ntrp: 3.7, slots: new Set(), types: new Set() },
    });
  });

  const profile = page.locator("#profile-completion-sheet");
  const ntrp = profile.getByLabel("NTRP 程度（選填）");
  await expect(ntrp).toHaveValue("3.7");
  await ntrp.focus();
  await ntrp.press("ArrowUp");
  await expect(ntrp).toHaveValue("3.8");
  await expect(ntrp).toHaveAttribute("step", "0.1");
  await ntrp.fill("3.7");
  await profile.getByLabel("公開暱稱").fill("新暱稱");
  await profile.getByTestId("profile-save").click();
  await expect(profile).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__savedOneDecimalProfile)).toEqual({
    nick: "新暱稱",
    ntrp: 3.7,
  });
  expect(runtimeErrors).toEqual([]);
});

test("profile NTRP accepts 1.0 and 7.0 but rejects excess precision and out-of-range values", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const submitNtrp = async (value) => {
    await page.evaluate(async (nextValue) => {
      const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
      window.__profileNtrpResults = window.__profileNtrpResults ?? [];
      openProfileCompletionSheet({
        onSave: async (draft) => {
          window.__profileNtrpResults.push(draft.ntrp);
          return draft;
        },
        profile: { courts: new Set(), nick: "邊界球友", ntrp: nextValue, slots: new Set(), types: new Set() },
      });
    }, Number(value));
    const profile = page.locator("#profile-completion-sheet");
    await expect(profile).toBeVisible();
    await profile.getByLabel("NTRP 程度（選填）").fill(value);
    await profile.getByTestId("profile-save").click();
    return profile;
  };

  const excessPrecision = await submitNtrp("3.77");
  await expect(excessPrecision.getByRole("alert")).toContainText("最多一位小數");
  await page.keyboard.press("Escape");

  for (const valid of ["1.0", "7.0"]) {
    const profile = await submitNtrp(valid);
    await expect(profile).toBeHidden();
  }

  for (const invalid of ["0.9", "7.1"]) {
    const profile = await submitNtrp(invalid);
    await expect(profile.getByRole("alert")).toContainText("1.0 到 7.0");
    await page.keyboard.press("Escape");
  }

  await expect.poll(() => page.evaluate(() => window.__profileNtrpResults)).toEqual([1, 7]);
  expect(runtimeErrors).toEqual([]);
});

test("a 390px profile sheet saves a nickname-only draft without horizontal overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-chromium", "this assertion exercises the requested 390px viewport");
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
    openProfileCompletionSheet({
      onSave: async (draft) => {
        window.__nicknameOnlyProfile = {
          ...draft,
          courts: [...draft.courts],
          slots: [...draft.slots],
          types: [...draft.types],
        };
        return draft;
      },
      profile: { courts: new Set(), nick: "", ntrp: null, slots: new Set(), types: new Set() },
    });
  });
  const profile = page.locator("#profile-completion-sheet");
  await expect(profile).toBeVisible();
  const width = await profile.evaluate((node) => ({
    client: node.clientWidth,
    scroll: node.scrollWidth,
  }));
  expect(width.client).toBeLessThanOrEqual(390);
  expect(width.scroll).toBeLessThanOrEqual(390);
  await profile.getByLabel("公開暱稱").fill("暱稱即可");
  await profile.getByTestId("profile-save").click();
  await expect(profile).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__nicknameOnlyProfile)).toEqual({
    courts: [],
    nick: "暱稱即可",
    ntrp: null,
    slots: [],
    types: [],
  });
  expect(runtimeErrors).toEqual([]);
});

test("delayed Taipei court options hydrate open profile and create forms without losing drafts", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
    window.__delayedProfileSheet = openProfileCompletionSheet({
      courts: [],
      courtsReady: false,
      profile: { courts: new Set(), nick: "", ntrp: 3.5, slots: new Set(["we-m"]), types: new Set() },
    });
  });
  const profile = page.locator("#profile-completion-sheet");
  const profileCourts = profile.locator("[data-profile-courts]");
  const profileCourtsStatus = profile.locator("[data-profile-courts-status]");
  await expect(profileCourts.locator("input[type=checkbox]")).toHaveCount(0);
  await expect(profileCourtsStatus).toContainText("正在載入台北市球場…");
  await profile.getByLabel("公開暱稱").fill("草稿球友");
  await profile.getByLabel("單打", { exact: true }).check();
  await page.evaluate(() =>
    window.__delayedProfileSheet.setCourts(
      [
        { city: "新北市", district: "新店區", id: 9, name: "不應出現球場" },
        { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
      ],
      { ready: true }
    )
  );
  await expect(profileCourts.locator("input[type=checkbox]")).toHaveCount(1);
  await expect(profileCourts).toContainText("示範球場");
  await expect(profile.getByLabel("公開暱稱")).toHaveValue("草稿球友");
  await expect(profile.getByLabel("單打", { exact: true })).toBeChecked();
  await profile.getByTestId("profile-court-8").check();
  await page.evaluate(() =>
    window.__delayedProfileSheet.setCourts(
      [
        { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
        { city: "台北市", district: "中山區", id: 10, name: "第二球場" },
      ],
      { ready: true }
    )
  );
  await expect(profile.getByTestId("profile-court-8")).toBeChecked();
  await expect(profile.getByTestId("profile-court-10")).not.toBeChecked();
  await page.keyboard.press("Escape");

  // 批 D5:球場改 grid 而非 select,「草稿」已經是 JS state(form 物件)而非讀
  // DOM——courts 延遲抵達時只重繪 grid 選項,不會動到其他欄位已寫入的 state,
  // 所以這裡改成驗證「courts 就緒前填的其他欄位在 setCourts 之後還在」。
  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await window.__importAppModule("sessionViews");
    window.__delayedCreateSheet = openCreateSessionSheet({ courts: [], courtsReady: false });
  });
  const create = page.locator("#session-create-modal");
  const form = create.getByTestId("session-form");
  const createCourtsStatus = form.locator("[data-create-courts-status]");
  await expect(createCourtsStatus).toContainText("正在載入台北市球場…");
  await form.getByTestId("create-date-custom").click();
  await form.getByTestId("create-date-custom-input").fill("2099-07-18");
  await form.getByTestId("create-time-09:00").click();
  await form.getByTestId("create-play-type-單打").click();
  await form.getByTestId("create-band-lo").click();
  await form.getByTestId("session-notes").fill("保留這段草稿");
  await page.evaluate(() =>
    window.__delayedCreateSheet.setCourts(
      [
        { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
        { city: "新北市", district: "新店區", id: 9, name: "不應出現球場" },
      ],
      { ready: true }
    )
  );
  await expect(createCourtsStatus).toBeHidden();
  await expect(form.getByTestId("session-court")).toContainText("示範球場");
  await expect(form.getByTestId("session-court").locator("[data-role='court']")).toHaveCount(1);
  await expect(form.getByTestId("session-start-at")).toHaveValue("2099-07-18T09:00");
  await expect(form.getByTestId("create-play-type-單打")).toHaveClass(/is-selected/);
  await expect(form.getByTestId("create-band-lo")).toHaveClass(/is-selected/);
  await expect(form.getByTestId("session-notes")).toHaveValue("保留這段草稿");
  await form.getByTestId("create-court-8").click();
  await page.evaluate(() =>
    window.__delayedCreateSheet.setCourts(
      [
        { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
        { city: "台北市", district: "中山區", id: 10, name: "第二球場" },
      ],
      { ready: true }
    )
  );
  await expect(form.getByTestId("create-court-8")).toHaveClass(/is-selected/);
  expect(runtimeErrors).toEqual([]);
});

test("a mock profile save preserves existing courts while the catalogue has no options", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
    window.__mockSavedProfileCourts = null;
    openProfileCompletionSheet({
      courts: [],
      courtsReady: false,
      onSave: async (draft) => {
        window.__mockSavedProfileCourts = [...draft.courts];
        return draft;
      },
      profile: {
        courts: new Set(["既有台北球場"]),
        nick: "保留球場球友",
        ntrp: null,
        slots: new Set(),
        types: new Set(),
      },
    });
  });

  const profile = page.locator("#profile-completion-sheet");
  await expect(profile.locator("[data-profile-courts] input")).toHaveCount(0);
  await profile.getByTestId("profile-save").click();
  await expect(profile).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__mockSavedProfileCourts)).toEqual(["既有台北球場"]);
  expect(runtimeErrors).toEqual([]);
});

test("profile sheet saves selected home courts via checkboxes", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
    window.__savedProfileCourts = null;
    openProfileCompletionSheet({
      courts: [
        { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
        { city: "台北市", district: "中山區", id: 9, name: "第二球場" },
        { city: "台北市", district: "萬華區", id: 10, name: "第三球場" },
      ],
      courtsReady: true,
      onSave: async (draft) => {
        window.__savedProfileCourts = [...draft.courts].sort();
        return draft;
      },
      profile: { courts: new Set(), nick: "球場球友", ntrp: null, slots: new Set(), types: new Set() },
    });
  });

  const profile = page.locator("#profile-completion-sheet");
  await profile.getByTestId("profile-court-8").check();
  await profile.getByTestId("profile-court-9").check();
  await profile.getByTestId("profile-save").click();
  await expect(profile).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__savedProfileCourts)).toEqual(["8", "9"]);
  expect(runtimeErrors).toEqual([]);
});

test("mock-mode create does not open OAuth or fabricate a new session", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  const initialCardCount = await page.getByTestId("session-card").count();

  await page.getByTestId("create-session-tab").click();
  await expect(page.locator("#toast-root")).toContainText("本機示範資料僅供瀏覽");
  await expect(page.locator("#login-dialog")).toBeHidden();
  await expect(page.getByTestId("session-card")).toHaveCount(initialCardCount);
  expect(runtimeErrors).toEqual([]);
});

test("mock online layer uses presence pins while the full directory list opens cards and invitations", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.getByTestId("player-layer-toggle").click();
  await expect(page.locator("#toast-root")).toContainText("本機示範資料僅供瀏覽");
  await page.getByTestId("player-directory-open").click();
  await expect(page.locator("#toast-root")).toContainText("本機示範資料僅供瀏覽");

  await page.evaluate(async () => {
    const { renderPlayerPins } = await window.__importAppModule("map");
    const { createDataApi } = await window.__importAppModule("dataApi");
    const { createSessionController } = await window.__importAppModule("sessionController");
    const { openCourtPlayersDrawer, openPlayerCardSheet, openPlayerDirectoryList, renderPlayerLayerToggle } = await window.__importAppModule("sessionViews");
    const map = new window.google.maps.Map(document.getElementById("map"), {
      center: { lat: 25.05, lng: 121.53 },
      zoom: 12,
    });
    let playerMarkers = [];
    const baseApi = createDataApi();
    const hostedSession = {
      court: "台北網球中心",
      courtDistrict: "內湖區",
      sessionId: 9901,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: "open",
      viewerRole: "host",
    };
    const api = {
      ...baseApi,
      inviteToSession: async (sessionId, profileId) => {
        window.__mockDirectoryInvite = [sessionId, profileId];
        return { outcome: "OK", reloadRequired: false };
      },
      loadMySessions: async () => [hostedSession],
    };
    let controller;
    controller = createSessionController({
      api,
      openCourtPlayersDrawer,
      openPlayerDirectoryList,
      openPlayerCard: openPlayerCardSheet,
      renderPlayers: (view) => {
        renderPlayerLayerToggle(document.getElementById("player-layer-toggle"), view);
        playerMarkers = renderPlayerPins(
          window.google,
          map,
          view.on ? view.groups : [],
          (court, players) => controller.openPlayerCourt(court, players),
          playerMarkers
        );
      },
    });
    await controller.setAuthState({ user: { id: "mock-player-host" } }, { directory: true, nickname: true, ntrp: true });
    await controller.togglePlayerLayer();
    window.__mockPlayerController = controller;
  });

  await expect(page.getByTitle("在線 · 台北網球中心 · 1 人")).toBeVisible();
  await expect(page.getByTitle(/^在線 · 大佳河濱公園網球場/)).toHaveCount(0);
  await page.getByTitle("在線 · 台北網球中心 · 1 人").click();
  const playerCard = page.getByTestId("court-player-card-8001");
  await expect(playerCard).toContainText("示範山嵐");
  await expect(playerCard).toContainText("在線・2 分鐘前");
  await expect(playerCard).toContainText("接受現場問候");
  await playerCard.click();
  await expect(page.locator("#player-card-sheet")).toContainText("示範山嵐");
  await expect(page.locator("#player-card-sheet")).toContainText("在線・2 分鐘前");
  await expect(page.locator("#player-card-sheet")).toContainText("接受現場問候");

  await page.evaluate(() => window.__mockPlayerController.openPlayerDirectory());
  const directory = page.locator("#player-directory-sheet");
  await expect(directory).toBeVisible();
  await expect(directory.locator("[data-player-directory-row]")).toHaveCount(3);
  await expect(directory.locator("[data-player-directory-row]").first()).toContainText("示範山嵐");
  await expect(directory.locator("[data-player-directory-row]").first()).toContainText("在線");
  await page.getByTestId("player-directory-row-8002").click();
  await expect(page.locator("#player-card-sheet")).toContainText("示範海風");
  await page.getByTestId("player-invite-session").check();
  await page.getByTestId("player-invite-submit").click();
  await expect(page.getByText("邀請已送出", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__mockDirectoryInvite)).toEqual([9901, 8002]);
  expect(runtimeErrors).toEqual([]);
});

test("player directory escapes every dynamic field before opening the selected public card", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openPlayerDirectoryList } = await window.__importAppModule("sessionViews");
    const sheet = openPlayerDirectoryList({
      onOpenPlayer: (player) => {
        window.__escapedDirectoryPlayer = player.profileId;
      },
    });
    sheet.setDirectory({
      players: [
        {
          courtNames: ['<img id="directory-court-injection">'],
          isPresent: true,
          nickname: '<img id="directory-name-injection">',
          ntrp: 3.5,
          playTypes: ['<img id="directory-type-injection">'],
          profileId: 8801,
          slotCodes: ["we-m"],
        },
      ],
      status: "ready",
    });
  });

  const directory = page.locator("#player-directory-sheet");
  await expect(directory).toContainText('<img id="directory-name-injection">');
  await expect(page.locator("#directory-name-injection, #directory-court-injection, #directory-type-injection")).toHaveCount(0);
  await page.getByTestId("player-directory-row-8801").click();
  await expect.poll(() => page.evaluate(() => window.__escapedDirectoryPlayer)).toBe(8801);
  expect(runtimeErrors).toEqual([]);
});

test("chat sheet escapes user bodies, separates system messages, and becomes archived read-only", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openSessionChatSheet } = await window.__importAppModule("sessionViews");
    window.__chatActions = [];
    const sheet = openSessionChatSheet(
      {
        court: "示範球場",
        courtDistrict: "大安區",
        playType: "雙打",
        sessionId: 8101,
        slotsRemaining: 0,
        startAt: "2026-08-03T10:00:00+08:00",
        status: "open",
      },
      {
        canWithdraw: true,
        onBlock: (profileId) => window.__chatActions.push(["block", profileId]),
        onPost: (body) => window.__chatActions.push(["post", body]),
        onReport: (messageId) => window.__chatActions.push(["report", messageId]),
      }
    );
    const feed = document.querySelector("[data-chat-feed]");
    // 批 D7:聊天室改全螢幕殼後,.chat-feed 的 flex:1 1 auto 是在一個「有明確高度」的
    // fixed inset:0 容器內(不再是舊版 auto-height 的浮卡),flex-grow 會把 inline
    // height 覆蓋回撐滿可用空間——inline height 只決定 flex-basis 起點,不是最終
    // 尺寸的硬上限。改用 max-height 才能真的把它夾到 1px,逼出這條測試要驗的
    // 「訊息比可視區高、需要捲動」情境。
    feed.style.maxHeight = "1px";
    feed.style.overflow = "auto";
    sheet.setState({
      messages: [
        {
          body: "球局資訊已更新",
          createdAt: "2026-08-03T01:00:00Z",
          isSelf: false,
          kind: "system",
          messageId: 1,
          senderNickname: "",
          senderProfileId: null,
          sessionId: 8101,
        },
        {
          body: '<img src=x onerror="window.__chatXss=1">一起打球 & 喝水',
          createdAt: "2026-08-03T01:01:00Z",
          isSelf: false,
          kind: "user",
          messageId: 2,
          senderNickname: "示範球友 <script>",
          senderProfileId: 92,
          sessionId: 8101,
        },
        {
          body: "收到",
          createdAt: "2026-08-03T01:02:00Z",
          isSelf: true,
          kind: "user",
          messageId: 3,
          senderNickname: "我",
          senderProfileId: 91,
          sessionId: 8101,
        },
      ],
      roster: [
        { nickname: "主揪", profileId: 91, role: "host", status: "accepted" },
        { nickname: "示範球友", profileId: 92, role: "guest", status: "accepted" },
        { nickname: "等待者", profileId: 93, role: "guest", status: "requested" },
      ],
      status: "ready",
    });
    window.__chatSheet = sheet;
  });

  const chat = page.getByTestId("session-chat-sheet");
  const scannedMessages = chat.locator("[data-chat-message]");
  await expect(scannedMessages).toHaveCount(3);
  expect(await scannedMessages.count(), "the rendered message scan must be nonempty").toBeGreaterThan(0);
  await expect(chat.locator("img")).toHaveCount(0);
  await expect(chat.locator("script")).toHaveCount(0);
  await expect(chat.getByText('<img src=x onerror="window.__chatXss=1">一起打球 & 喝水')).toBeVisible();
  await expect(chat.locator('[data-chat-message-kind="system"]')).toContainText("球局資訊已更新");
  await expect(chat.locator('[data-chat-message-self="true"]')).toContainText("收到");
  await expect(chat.getByText("等待者")).toHaveCount(0);
  // 批 D7:聊天室新增 header 副行(chat-v2__sub,含「主揪 X」文字),此 fixture 沒填
  // hostNickname 故副行落回泛用「主揪」二字——跟 roster 裡暱稱剛好也叫「主揪」的成員
  // 撞字,原本不分區域的 chat.getByText("主揪") 會判定成 strict violation。改成跟下一行
  // 同一套「限定 [data-chat-roster] 範圍」寫法,驗證的仍是 roster 顯示了這位成員。
  await expect(chat.locator("[data-chat-roster]").getByText("主揪")).toBeVisible();
  await expect(chat.locator("[data-chat-roster]")).toContainText("示範球友");
  const scroll = await chat.locator("[data-chat-feed]").evaluate((feed) => ({
    clientHeight: feed.clientHeight,
    scrollHeight: feed.scrollHeight,
    scrollTop: feed.scrollTop,
  }));
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
  expect(scroll.scrollTop).toBe(scroll.scrollHeight - scroll.clientHeight);

  await expect(chat.locator("[data-chat-feed]")).not.toHaveAttribute("aria-live", /.+/);
  const announcement = chat.locator("[data-chat-announcement]");
  await expect(announcement).toHaveAttribute("aria-live", "polite");
  await expect(announcement).toHaveText("");
  await page.evaluate(() =>
    window.__chatSheet.setState({
      messages: [
        {
          body: "這是刷新後的新訊息",
          createdAt: "2026-08-03T01:03:00Z",
          isSelf: false,
          kind: "user",
          messageId: 4,
          senderNickname: "示範球友",
          senderProfileId: 92,
          sessionId: 8101,
        },
      ],
      roster: [],
      status: "ready",
    })
  );
  await expect(announcement).toHaveText("新增 1 則訊息");

  await page.evaluate(() => window.__chatSheet.setState({ messages: [], roster: [], status: "ready" }));
  await expect(chat).toContainText("目前還沒有訊息，從一句招呼開始吧。");
  await page.evaluate(() => window.__chatSheet.setArchived());
  await expect(chat.getByTestId("chat-message-input")).toBeDisabled();
  await expect(chat).toContainText("球局已封存");
  await expect(chat.locator("[data-chat-withdraw]")).toHaveCount(0);
  await chat.locator("[data-surface-close]").click();
  await expect(chat).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions exposes chat only to accepted members while Me owns the authoritative block list", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMePage, renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("my-sessions-page").hidden = false;
    document.getElementById("me-page").hidden = false;
    const base = {
      canCancel: false,
      canConfirmAttendance: false,
      canConfirmPlayed: false,
      canRespondInvite: false,
      court: "示範球場",
      courtDistrict: "大安區",
      hostNickname: "示範主揪",
      playType: "雙打",
      sessionId: 8201,
      slotsRemaining: 0,
      startAt: "2026-08-04T10:00:00+08:00",
      status: "open",
      viewerRole: "guest",
    };
    window.__myChatActions = [];
    renderMePage(document.getElementById("me-root"), {
      authSession: { user: { id: "block-list-test" } },
      blockedPlayers: [{ blockedNickname: "已封鎖球友 <b>", blockedProfileId: 92, createdAt: "2026-08-03T01:00:00Z" }],
      blockedPlayersStatus: "ready",
      onUnblockPlayer: (profileId) => window.__myChatActions.push(["unblock", profileId]),
    });
    renderMySessionsPage(root, {
      authenticated: true,
      groups: {
        history: [],
        needsAction: [],
        needsActionCount: 0,
        upcoming: [
          { ...base, canWithdraw: true, viewerParticipantStatus: "accepted" },
          { ...base, canWithdraw: true, sessionId: 8202, viewerParticipantStatus: "requested" },
        ],
      },
      onOpenChat: (sessionId) => window.__myChatActions.push(["chat", sessionId]),
    });
  });

  const root = page.locator("#my-sessions-root");
  const meRoot = page.locator("#me-root");
  await expect(root.getByTestId("open-chat-8201")).toBeVisible();
  await expect(root.getByTestId("open-chat-8202")).toHaveCount(0);
  // 封鎖清單已搬到「我」頁，My Sessions 不該再渲染它。
  await expect(root.getByTestId("blocked-player-list")).toHaveCount(0);
  await expect(root.getByTestId("unblock-player-92")).toHaveCount(0);
  await expect(meRoot.getByTestId("blocked-player-list")).toBeVisible();
  await expect(meRoot.locator("b")).toHaveCount(0);
  // local 的 390px 守衛掃不到解除封鎖鍵（那個帳號沒有封鎖資料），在這裡補觸控目標下限。
  await expect
    .poll(
      async () =>
        meRoot.getByTestId("unblock-player-92").evaluate((node) => {
          const box = node.getBoundingClientRect();
          return Math.min(box.height, box.width);
        }),
      { message: "解除封鎖鍵的觸控目標最短邊必須 ≥44px" }
    )
    .toBeGreaterThanOrEqual(44);
  await expect(meRoot.getByText("已封鎖球友 <b>")).toBeVisible();
  await root.getByTestId("open-chat-8201").click();
  await meRoot.getByTestId("unblock-player-92").click();
  await expect.poll(() => page.evaluate(() => window.__myChatActions)).toEqual([
    ["chat", "8201"],
    ["unblock", "92"],
  ]);
});

test("the create form asks about the venue situation and offers three play types and slot buttons", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await window.__importAppModule("sessionViews");
    openCreateSessionSheet({
      courts: [{ city: "台北市", id: 8, name: "示範球場" }],
      onSubmit: async (input) => {
        window.__createdInput = input;
      },
    });
  });

  const createSheet = page.locator("#session-create-modal");
  const form = createSheet.getByTestId("session-form");

  // 批 D5:場地情境改問「已定球場／先列候選」segmented + 「已訂場」toggle;
  // 舊三值 radio 與其逐條說明文案退場,新版由 segmented 標籤 + toggle 副標接手。
  await expect(form.getByTestId("create-mode-fixed")).toHaveText("已定球場");
  await expect(form.getByTestId("session-venue-candidates")).toHaveText("先列候選");
  await expect(createSheet).toContainText("已預訂場地，費用到場均分。");
  await expect(createSheet).toContainText("候選模式先不填訂場");

  // 打法三個 chips（正向量前提在先，反向斷言才有意義）。
  const playTypeChips = form.locator('[data-role="play-type"]');
  await expect(playTypeChips).toHaveCount(3);
  await expect(playTypeChips).toHaveText(["單打", "雙打", "練球"]);
  await expect(form.getByTestId("create-play-type-對拉")).toHaveCount(0);
  await expect(createSheet).toContainText("練球｜餵球、對拉、發球等不計分的練習。");

  // 缺幾位改 stepper，文案保留。
  await expect(form.getByTestId("create-need-value")).toHaveText("2");
  await expect(createSheet).toContainText("不含你自己。");

  // 單打→1、雙打→3 的連動保留（stepper 版）。
  await form.getByTestId("create-play-type-單打").click();
  await expect(form.getByTestId("create-need-value")).toHaveText("1");
  await form.getByTestId("create-play-type-雙打").click();
  await expect(form.getByTestId("create-need-value")).toHaveText("3");

  // 手動改選（− 一次)仍送得出正確的值。
  await form.getByTestId("create-need-minus").click();
  await expect(form.getByTestId("create-need-value")).toHaveText("2");
  await form.getByTestId("create-court-8").click();
  await form.getByTestId("create-date-custom").click();
  await form.getByTestId("create-date-custom-input").fill("2099-07-18");
  await form.getByTestId("create-time-09:00").click();
  await form.getByTestId("session-submit").click();
  await expect.poll(() => page.evaluate(() => window.__createdInput?.slotsTotal)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.__createdInput?.playType)).toBe("雙打");
  expect(runtimeErrors).toEqual([]);
});

test("an existing 對拉 session still saves from the edit form while new sessions cannot pick it", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openEditSessionSheet } = await window.__importAppModule("sessionViews");
    openEditSessionSheet(
      {
        courtId: 8,
        feeNote: "",
        notes: "",
        ntrpMax: null,
        ntrpMin: null,
        playType: "對拉",
        sessionId: 4242,
        slotsTotal: 2,
        startAt: "2099-07-18T01:30:00.000Z",
        venueType: "booked",
      },
      {
        courts: [{ city: "台北市", id: 8, name: "示範球場" }],
        onSubmit: async (input) => {
          window.__editedInput = input;
        },
      }
    );
  });

  const editForm = page.getByTestId("session-edit-form");
  // 同一個「適合程度」欄位在建局有說明、編輯沒有是不一致;三處共用同一個匯出常數。
  const ntrpExplanation = await page.evaluate(
    async () => (await window.__importAppModule("sessionViews")).NTRP_SCALE_EXPLANATION
  );
  await expect(editForm.locator("[data-ntrp-explanation]")).toHaveText(ntrpExplanation);
  const options = editForm.getByTestId("session-edit-play-type").locator("option");
  // 正向前提：三個新選項在；額外那一個才是為既有球局保留的。
  await expect(options).toHaveText(["單打", "雙打", "練球", "對拉"]);
  await expect(editForm.getByTestId("session-edit-play-type")).toHaveValue("對拉");
  // 這局的 NTRP／費用說明／備註四欄皆空，進階設定摺疊區必須維持預設收合。
  await expect(editForm.locator(".form-optional")).not.toHaveAttribute("open");

  // 只改缺額，打法維持「對拉」——前端驗證不得擋下既有球局。
  await editForm.getByTestId("session-edit-slots-3").check();
  await editForm.getByTestId("session-edit-submit").click();
  await expect.poll(() => page.evaluate(() => window.__editedInput?.playType)).toBe("對拉");
  await expect.poll(() => page.evaluate(() => window.__editedInput?.slotsMissing)).toBe(3);
  expect(runtimeErrors).toEqual([]);
});

test("edit sheet expands advanced settings by default when the session already has NTRP, fee note, or notes", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openEditSessionSheet } = await window.__importAppModule("sessionViews");
    openEditSessionSheet(
      {
        courtId: 8,
        feeNote: "每人 150 元",
        notes: "自備新球",
        ntrpMax: 4,
        ntrpMin: 3,
        playType: "單打",
        sessionId: 4343,
        slotsTotal: 1,
        startAt: "2099-07-18T01:30:00.000Z",
        venueType: "booked",
      },
      { courts: [{ city: "台北市", id: 8, name: "示範球場" }] }
    );
  });

  const editForm = page.getByTestId("session-edit-form");
  await expect(editForm).toBeVisible();
  // 漸進式揭露反模式防呆：已填的選填欄位不可被預設收合藏起來。
  await expect(editForm.locator(".form-optional")).toHaveAttribute("open");
  await expect(editForm.locator("#session-edit-ntrp-min")).toBeVisible();
  await expect(editForm.locator("#session-edit-ntrp-min")).toHaveValue("3");
  await expect(editForm.locator("#session-edit-ntrp-max")).toHaveValue("4");
  await expect(editForm.getByLabel("費用說明（選填，最多 500 字）")).toHaveValue("每人 150 元");
  await expect(editForm.getByLabel("備註（選填，最多 500 字）")).toHaveValue("自備新球");
  expect(runtimeErrors).toEqual([]);
});

test("the profile sheet still offers all four practice types", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
    openProfileCompletionSheet({
      courts: [{ city: "台北市", id: 8, name: "示範球場" }],
      profile: { courts: new Set(), nick: "測試球友", ntrp: 3.5, slots: new Set(), types: new Set(["對拉"]) },
    });
  });

  const sheet = page.locator("#profile-completion-sheet");
  const typeBoxes = sheet.locator('input[name="profile-types"]');
  // 建局表單收斂為三種，個人檔案的常打類型必須維持四種。
  await expect(typeBoxes).toHaveCount(4);
  await expect(sheet.locator('input[name="profile-types"][value="對拉"]')).toBeChecked();
  expect(runtimeErrors).toEqual([]);
});

test("the type filter offers three chips and no longer lists 對拉", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.locator("#filter-sheet-open").click();
  const chips = page.locator('#filters-sheet [data-filter="types"]');
  // 正向前提在先：掃描集非空，下面的 count(0) 才有意義。
  await expect(chips).toHaveCount(3);
  await expect(chips).toHaveText(["單打", "雙打", "練球"]);
  await expect(page.locator('#filters-sheet [data-filter="types"][data-value="對拉"]')).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});

test("subscribing to every Taipei court collapses the picker and reopens on demand", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMePage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("me-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("me-page").hidden = false;
    const courts = [
      { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
      { city: "台北市", district: "中山區", id: 9, name: "第二球場" },
      { city: "台北市", district: "萬華區", id: 10, name: "第三球場" },
    ];
    renderMePage(root, {
      authSession: { user: { id: "court-subscription-test" } },
      courts,
      // 已訂閱全部：重載後主控應為勾選、清單收合。
      notificationSettings: { courtIds: courts.map((court) => court.id) },
      onSaveCourtSubscriptions: async (courtIds) => {
        window.__savedCourts = courtIds;
      },
    });
  });

  const picker = page.locator("#notification-court-picker");
  const toggle = page.getByTestId("toggle-court-picker");
  // 正向前提：三座都渲染了，下面的收合斷言才不是掃到空集合。
  await expect(picker.locator("input[data-notification-court]")).toHaveCount(3);
  await expect(page.getByTestId("subscribe-all-courts")).toBeChecked();
  await expect(picker).toBeHidden();
  await expect(page.locator("#me-root")).toContainText("已訂閱 3 座");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  // 展開後可單獨取消一座，主控隨即變成未勾。
  await toggle.click();
  await expect(picker).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.getByTestId("notification-court-9").uncheck();
  await expect.poll(() => page.evaluate(() => window.__savedCourts)).toEqual([8, 10]);
  await expect(page.getByTestId("subscribe-all-courts")).not.toBeChecked();
  await expect(page.locator("#me-root")).toContainText("已訂閱 2 座");
  expect(runtimeErrors).toEqual([]);
});

test("an unloaded court catalogue shows no subscription count", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMePage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("me-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("me-page").hidden = false;
    // 球場目錄還沒載入：交集必然是 0，但那不代表使用者「訂閱了 0 座」。
    renderMePage(root, { authSession: { user: { id: "empty-courts-test" } }, courts: [] });
  });

  // 正向前提：通知區塊有渲染，下面的 count(0) 才不是掃到空頁面。
  await expect(page.locator("#me-root .notification-settings")).toBeVisible();
  await expect(page.locator("#me-root [data-court-subscription-count]")).toHaveCount(0);
  await expect(page.locator("#me-root")).not.toContainText("已訂閱 0 座");
  expect(runtimeErrors).toEqual([]);
});

// 批 D4a:場地型／指定球場／日期 input 三組退場,行政區改多選 chips,新增「看 N 場
// 球局」主鈕(data-filter="apply")——六組:dateKey、band、types、districts、
// reset、apply。
test("openFilterSheet mounts a dialog with six data-filter groups and closes on Escape", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openFilterSheet } = await window.__importAppModule("sessionViews");
    const { COURTS } = await window.__importAppModule("mockData");
    const { DEFAULT_FILTER_STATE } = await window.__importAppModule("filters");
    window.__filterSheetCloseCalls = 0;
    window.__filterSheet = openFilterSheet({
      filters: { ...DEFAULT_FILTER_STATE, types: new Set(), districts: new Set() },
      courts: COURTS,
      onSetFilter: () => {},
      onReset: () => {},
      onClose: () => {
        window.__filterSheetCloseCalls += 1;
      },
    });
  });

  const sheet = page.locator("#filters-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("role", "dialog");
  await expect(sheet).toHaveAttribute("aria-label", "篩選球局");
  await expect(sheet.locator("h2")).toHaveText("篩選球局");

  const fieldGroups = await page.evaluate(() =>
    [...document.querySelectorAll("#filters-sheet [data-filter]")].map((node) => node.dataset.filter)
  );
  expect(new Set(fieldGroups)).toEqual(new Set(["dateKey", "band", "types", "districts", "reset", "apply"]));

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__filterSheetCloseCalls)).toBe(1);
  expect(runtimeErrors).toEqual([]);
});

test("the filter sheet applies a district change immediately to the background drawer summary and keeps keyboard focus off body", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const firstSummary = await page.evaluate(async () => {
    const { openFilterSheet, renderNearbySessionsDrawer } = await window.__importAppModule("sessionViews");
    const { MOCK_SESSIONS, COURTS } = await window.__importAppModule("mockData");
    const { filterSessions, DEFAULT_FILTER_STATE } = await window.__importAppModule("filters");

    // 獨立、脫離真實 controller publish 週期的抽屜節點：避免 mock 2.5 秒 discovery
    // delay 之後真實 controller 重繪蓋掉這裡的斷言，見 task-2-report concerns。
    const drawerRoot = document.createElement("div");
    drawerRoot.id = "filter-sheet-test-drawer";
    document.body.appendChild(drawerRoot);

    let testFilters = { ...DEFAULT_FILTER_STATE, types: new Set(), districts: new Set() };
    window.__filterSheetSummaries = [];
    const renderDrawer = () => {
      renderNearbySessionsDrawer(drawerRoot, {
        sessions: filterSessions(MOCK_SESSIONS, testFilters),
        courts: COURTS,
      });
      window.__filterSheetSummaries.push(drawerRoot.querySelector("#nearby-sessions-summary").textContent);
    };
    renderDrawer();

    openFilterSheet({
      filters: testFilters,
      courts: COURTS,
      onSetFilter: (field, value) => {
        testFilters = { ...testFilters, [field]: value };
        renderDrawer();
      },
      onReset: () => {},
      onClose: () => {},
    });
    return window.__filterSheetSummaries[0];
  });
  // mock 資料共 8 局、其中 9003 額滿不計:可加入 7 局。正向前提在先，下面篩到內湖區才有意義。
  expect(firstSummary).toContain("7 場可加入");

  const districtChip = page.locator('#filters-sheet [data-filter="districts"][data-value="內湖區"]');
  await districtChip.focus();
  await districtChip.press("Enter");

  await expect.poll(() => page.evaluate(() => window.__filterSheetSummaries.at(-1))).toContain("2 場可加入");
  expect(
    await page.evaluate(() => document.activeElement === document.querySelector('#filters-sheet [data-filter="districts"][data-value="內湖區"]'))
  ).toBe(true);

  // 鍵盤操作打法 chip 也不可把焦點丟到 body（批 B Task 4 的教訓：async 重繪吃焦點）。
  await page.evaluate(() => document.querySelector('#filters-sheet [data-filter="types"][data-value="單打"]').focus());
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(() => ({
      isBody: document.activeElement === document.body,
      isChip: document.activeElement === document.querySelector('#filters-sheet [data-filter="types"][data-value="單打"]'),
    }))
  ).toEqual({ isBody: false, isChip: true });

  expect(runtimeErrors).toEqual([]);
});

test("closing and reopening the filter sheet three times does not stack delegated listeners on the shared sheet root", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openFilterSheet } = await window.__importAppModule("sessionViews");
    const { COURTS } = await window.__importAppModule("mockData");
    const { DEFAULT_FILTER_STATE } = await window.__importAppModule("filters");
    window.__filterSheetSetFilterCalls = 0;
    const open = () =>
      openFilterSheet({
        filters: { ...DEFAULT_FILTER_STATE, types: new Set(), districts: new Set() },
        courts: COURTS,
        onSetFilter: () => {
          window.__filterSheetSetFilterCalls += 1;
        },
        onReset: () => {},
        onClose: () => {},
      });
    // mountSheet 的 close() 只清 #sheet-root 的 innerHTML,不會移除任何綁在 root 本身
    // 的 listener——這裡連續開關三次(第三次維持開啟),重現「委派疊加」的疑慮。
    open().close();
    open().close();
    open();
  });

  await page.locator('#filters-sheet [data-filter="districts"][data-value="內湖區"]').click();

  // 只剩「目前這次 open()」對應的委派會收到事件：疊加的話這裡會是 3。
  expect(await page.evaluate(() => window.__filterSheetSetFilterCalls)).toBe(1);
  expect(runtimeErrors).toEqual([]);
});

// 批 D9 backlog #4:批 D4a 把行政區改成固定的 12 區 chips(不再從 courts 派生)後，
// 篩選 sheet 內容已經與 courts 目錄完全無關(openFilterSheet() 的 courts 參數只傳入
// 未使用)，原本「等 courts 載入完成才解除 disabled，避免下拉永遠空白」的保守 gate
// 已無理由——已移除 setFilterSheetButtonEnabled()/index.html 初始 disabled。
// 這裡改驗證:即使 courts 目錄仍在載入中，主鈕也維持可用，點開的 sheet 內容仍完整
// (12 個行政區 chip 全部到齊，不是退化的空清單)。
test("the filter sheet button stays enabled and its content is complete even while the Taipei court catalogue is still loading", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await delayMockCourts(page, 800);
  await installFakeMaps(page);
  await page.goto("/", { waitUntil: "commit" });

  const filterButton = page.locator("#filter-sheet-open");
  await expect(filterButton).toBeEnabled();
  await expect(filterButton).not.toHaveAttribute("aria-disabled", "true");

  const sheet = page.locator("#filters-sheet");
  // waitUntil:"commit" 的早期視窗裡,按鈕可能先於 main.js 綁 handler 就存在;先前靠
  // 真實字型 CDN 的 render-blocking 延遲隱性同步,fixture stub 字型後不再成立。改用
  // 可重試的 click→visible 迴圈等 handler 就緒;仍遠在 800ms courts 視窗內,語意不變。
  await expect(async () => {
    await filterButton.click();
    await expect(sheet).toBeVisible({ timeout: 250 });
  }).toPass({ timeout: 4000 });
  await expect(sheet.locator('.filter-sheet-chips--district [data-filter="districts"]')).toHaveCount(12);

  // courts 目錄稍後才載入完成也不應該有任何額外副作用(如殘留錯誤或重繪把 sheet 關掉)。
  await page.waitForTimeout(900);
  await expect(sheet).toBeVisible();
  await expect.poll(() => readAppTestHook(page, ["dataApi", "loadCourts", "consumedCount"])).toBeGreaterThanOrEqual(1);
  expect(runtimeErrors).toEqual([]);
});

// 批 C2-4:篩選 sheet 專屬 Tab 循環——比照 performance.spec.js「keyboard dialogs trap
// focus」既有寫法，只驗證兩端 wrap-around（Shift+Tab 在第一個控件回到最後一個，
// Tab 在最後一個控件回到第一個），不逐一走訪每個中繼控件。
test("the filter sheet traps Tab focus between its own first and last controls", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const filterButton = page.locator("#filter-sheet-open");
  await expect(filterButton).toBeEnabled();
  await filterButton.click();

  const sheet = page.getByRole("dialog", { name: "篩選球局" });
  const sheetClose = sheet.getByRole("button", { name: "關閉篩選" });
  // 批 D4a:footer 新增「看 N 場球局」主鈕排在「重設」之後，DOM 順序上的最後一個
  // 可聚焦控件變成它(N 是動態場次數，用 data-filter 而非文字比對更穩)。
  const sheetApply = sheet.locator('[data-filter="apply"]');
  await expect(sheetClose).toBeFocused();
  await sheetClose.press("Shift+Tab");
  await expect(sheetApply).toBeFocused();
  await sheetApply.press("Tab");
  await expect(sheetClose).toBeFocused();

  expect(runtimeErrors).toEqual([]);
});
