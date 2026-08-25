import {
  expect,
  test,
  expectWithinViewport,
  installFakeMaps,
  setFakeMapBounds,
  publicSurface,
  installGeolocation,
  installControlledGeolocation,
  captureConsoleErrors,
  forceZeroMatchDistrictFilter,
} from "./fixtures/smoke.js";

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

  await expect
    .poll(async () => {
      const snapshot = await page.evaluate(() => window.__fakeMapsSnapshot());
      return snapshot.visibleMarkerOptions.length;
    })
    .toBeGreaterThan(0);
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

test("empty-state contextual buttons and the subscribe shortcut are visible and clickable while the drawer is open", async ({
  page,
}) => {
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

test("the empty-state subscribe shortcut opens Me and can focus the notification settings heading", async ({
  page,
}) => {
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

test("player drawer and card escape every public value and render self and empty invitation states", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const views = await window.__importAppModule("sessionViews");
    const player = {
      // eslint-disable-next-line no-useless-escape -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
      profileId: '\"><img id="profile-injection" src=x onerror=alert(1)>',
      nickname: '<img id="nickname-injection" src=x onerror=alert(1)>',
      // eslint-disable-next-line no-useless-escape -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
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
      {
        onOpenPlayer: (selected) => {
          window.__selectedEscapedPlayer = selected.profileId;
        },
      }
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
      slotCodes: ["we-a", 'mystery<img id="card-slot-injection">'],
      courtName: '<img id="card-court-injection">',
      courtDistrict: '<img id="card-district-injection">',
      isSelf: true,
    });
  });
  await expect(page.locator("#player-card-sheet")).toBeVisible();
  await expect(page.locator("#player-card-sheet img")).toHaveCount(0);
  await expect(page.locator("#player-card-sheet .player-profile")).toContainText(
    '時段：週末下午、mystery<img id="card-slot-injection">'
  );
  await expect(page.locator("#player-card-sheet [data-player-invite]")).toHaveCount(0);

  await page.evaluate(async () => {
    const views = await window.__importAppModule("sessionViews");
    window.__createFromPlayer = 0;
    views.openPlayerCardSheet?.(
      {
        profileId: 89,
        nickname: "無球局球友",
        ntrp: 3,
        playTypes: [],
        slotCodes: [],
        courtName: "河濱",
        courtDistrict: "中山區",
        isSelf: false,
      },
      {
        myInvitableSessions: [],
        onCreate: () => {
          window.__createFromPlayer += 1;
        },
      }
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
        {
          courtNames: ["示範球場"],
          isPresent: false,
          nickname: "有程度球友",
          ntrp: 4,
          profileId: 701,
          slotCodes: ["we-e"],
        },
        {
          courtNames: ["第二球場"],
          isPresent: false,
          nickname: "未填程度球友",
          ntrp: null,
          profileId: 702,
          slotCodes: [],
        },
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

test("player invitation form escapes session fields and is pending-safe across success, errors, and stale surfaces", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const views = await window.__importAppModule("sessionViews");
    window.__inviteControls = {};
    window.__inviteCalls = [];
    const promise = new Promise((resolve, reject) => Object.assign(window.__inviteControls, { reject, resolve }));
    views.openPlayerCardSheet?.(
      {
        profileId: 91,
        nickname: "可邀球友",
        ntrp: 4,
        playTypes: ["雙打"],
        slotCodes: ["we-a"],
        courtName: "大佳",
        courtDistrict: "中山區",
        isSelf: false,
      },
      {
        myInvitableSessions: [
          {
            // eslint-disable-next-line no-useless-escape -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
            sessionId: '\"><img id="session-id-injection">',
            startAt: '2030-01-01T01:00:00.000Z<img id="date-injection">',
            court: '<img id="session-court-injection">',
            courtDistrict: '<img id="session-district-injection">',
            playType: '<img id="session-type-injection">',
            notes: '<img id="session-notes-injection">',
          },
        ],
        onInvite: (sessionId) => {
          window.__inviteCalls.push(sessionId);
          return promise;
        },
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
      {
        profileId: 92,
        nickname: "錯誤球友",
        ntrp: 4,
        playTypes: [],
        slotCodes: [],
        courtName: "大佳",
        courtDistrict: "中山區",
        isSelf: false,
      },
      {
        myInvitableSessions: [
          {
            sessionId: 72,
            startAt: "2030-01-01T01:00:00.000Z",
            court: "大佳",
            courtDistrict: "中山區",
            playType: "雙打",
            notes: "",
          },
        ],
        onInvite: async () => {
          throw new Error("邀請遭拒");
        },
      }
    );
  });
  await page.getByTestId("player-invite-session").check();
  await page.getByTestId("player-invite-submit").click();
  await expect(page.locator("#player-card-sheet [role='alert']")).toHaveText("邀請遭拒");
  await expect(page.getByTestId("player-invite-submit")).toBeEnabled();

  await page.evaluate(async () => {
    const views = await window.__importAppModule("sessionViews");
    window.__staleInvite = {};
    const promise = new Promise((resolve) => {
      window.__staleInvite.resolve = resolve;
    });
    views.openPlayerCardSheet?.(
      {
        profileId: 93,
        nickname: "晚到球友",
        ntrp: 3,
        playTypes: [],
        slotCodes: [],
        courtName: "大佳",
        courtDistrict: "中山區",
        isSelf: false,
      },
      {
        myInvitableSessions: [
          {
            sessionId: 73,
            startAt: "2030-01-01T01:00:00.000Z",
            court: "大佳",
            courtDistrict: "中山區",
            playType: "雙打",
            notes: "",
          },
        ],
        onInvite: () => promise,
      }
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

test("SESSION_EXPIRED player invitation refreshes choices and renders an inline error instead of success", async ({
  page,
}) => {
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
  expect(layout.canScrollToFilterChip, "six chips must overflow a 390px viewport for this test to prove anything").toBe(
    true
  );
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
