import {
  expect,
  test,
  installFakeMaps,
  publicSurface,
  installGeolocation,
  captureConsoleErrors,
} from "./fixtures/smoke.js";

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
    const { preloadNonHomeViews } = await window.__importAppModule("sessionViews");
    const { renderMySessionsAppHarness } = await import("/tests/fixtures/mySessionsAppHarness.tsx");
    await preloadNonHomeViews("mySessions");
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
    const harness = renderMySessionsAppHarness(root, {
      authenticated: true,
      groups: groups(session(8801, "過期主揪場", "host")),
    });
    const queuedHostedSegmentClick = harness.rootElement.querySelector("[data-my-sessions-seg='hosted']");
    renderMySessionsAppHarness(root, {
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
  await expect(filterSheet.locator('[data-filter="districts"][data-value="內湖區"]')).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await filterSheet.locator('[data-filter="band"][data-value="mid"]').click();
  await expect(filterSheet.locator('[data-filter="band"][data-value="mid"]')).toHaveAttribute("aria-pressed", "true");
  await expect(filterSheet.locator('[data-filter="band"][data-value="all"]')).toHaveAttribute("aria-pressed", "false");
  // sheet 開著時,badge N 與地圖上仍看得到的程度控件都要同步鏡像。批 D4a:badge
  // 只計 types+districts 選取數(=2),不含 band,所以不是 3。
  await expect(page.locator("#filter-sheet-open")).toHaveText("篩選 ⋅2");
  await expect(page.locator("#filter-sheet-open")).toHaveAttribute("aria-label", "篩選，已套用 2 組條件");
  await expect(page.locator("#band-options [data-band='mid']")).toHaveAttribute("aria-pressed", "true");
  await filterSheet.locator('[data-filter="reset"]').click();
  await expect(filterSheet.locator('[data-filter="types"][data-value="單打"]')).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await expect(filterSheet.locator('[data-filter="districts"][data-value="內湖區"]')).toHaveAttribute(
    "aria-pressed",
    "false"
  );
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
  const renderedMarkerAttributes = await page
    .locator(".test-marker")
    .evaluateAll((markers) =>
      markers.map((marker) => ({ title: marker.getAttribute("title"), aria: marker.getAttribute("aria-label") }))
    );
  expect(JSON.stringify(renderedMarkerAttributes)).not.toMatch(/amber|line|profile|source|http/i);
  expect(runtimeErrors).toEqual([]);
});

// 批 D4a:badge N 改為只計 types+districts 選取數(dc L913 拍板),dateKey/band 兩者
// 即使切換也不移動 badge——這裡先證明「不移動」這件事本身,再證明真正會移動 badge
// 的兩個維度確實逐一增減正確,而不是只測「有變化」就當通過。
test("the filter badge counts only types+districts and mirrors dateKey/band both ways with the sheet", async ({
  page,
}) => {
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
  await expect(filterSheet.locator('[data-filter="dateKey"][data-value="today"]')).toHaveAttribute(
    "aria-pressed",
    "true"
  );
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
  await expect(filterSheet.locator('[data-filter="dateKey"][data-value="tomorrow"]')).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(filterSheet.locator('[data-filter="band"][data-value="pro"]')).toHaveAttribute("aria-pressed", "true");

  expect(runtimeErrors).toEqual([]);
});

test("the persistent count live region announces the current session count and updates when a filter narrows it", async ({
  page,
}) => {
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
  const openPins = visibleMarkerOptions.filter(
    ({ title }) => title?.includes("球局") && !title.includes("古亭") && !title.includes("未定")
  );
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

test("advanced marker diff makes an equivalent 60-second poll a zero-op and updates one changed row in place", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await expect(page.locator("#map")).toHaveAttribute("data-fake-google-map", "ready");

  const result = await page.evaluate(async () => {
    const { createMap, renderCourtBasePins } = await window.__importAppModule("map");
    const host = document.createElement("div");
    document.body.append(host);
    const map = createMap(window.google, host);
    const courts = [
      { city: "台北市", district: "大安區", id: 8801, lat: 25.03, lng: 121.54, name: "Diff 甲球場" },
      { city: "台北市", district: "內湖區", id: 8802, lat: 25.04, lng: 121.55, name: "Diff 乙球場" },
    ];
    const first = renderCourtBasePins(window.google, map, courts);
    const firstContents = first.map((marker) => marker.content);

    window.__resetFakeMapsOps();
    const afterPoll = renderCourtBasePins(
      window.google,
      map,
      courts.map((court) => ({ ...court }))
    );
    const unchangedOps = window.__fakeMapsSnapshot().markerOps;

    window.__resetFakeMapsOps();
    const afterChange = renderCourtBasePins(window.google, map, [{ ...courts[0], lat: 25.031 }, courts[1]]);
    const changedOps = window.__fakeMapsSnapshot().markerOps;
    host.remove();
    return {
      changedOps,
      contentNodesStable: afterPoll.every((marker, index) => marker.content === firstContents[index]),
      instancesStable: afterPoll.every((marker, index) => marker === first[index]),
      updatedInstancesStable: afterChange.every((marker, index) => marker === first[index]),
      unchangedOps,
    };
  });

  expect(result.unchangedOps).toEqual({ contentReplace: 0, create: 0, detach: 0, update: 0 });
  expect(result.instancesStable).toBe(true);
  expect(result.contentNodesStable).toBe(true);
  expect(result.changedOps).toEqual({ contentReplace: 0, create: 0, detach: 0, update: 1 });
  expect(result.updatedInstancesStable).toBe(true);
  expect(runtimeErrors).toEqual([]);
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
