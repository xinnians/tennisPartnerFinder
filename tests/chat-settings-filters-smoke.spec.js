import {
  expect,
  test,
  readAppTestHook,
  installFakeMaps,
  captureConsoleErrors,
  delayMockCourts,
} from "./fixtures/smoke.js";

test("chat sheet escapes user bodies, separates system messages, and becomes archived read-only", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openSessionChatSheet, preloadNonHomeViews } = await window.__importAppModule("sessionViews");
    await preloadNonHomeViews("chat");
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

test("My Sessions exposes chat only to accepted members while Me owns the authoritative block list", async ({
  page,
}) => {
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMeAppHarness } = await import("/tests/fixtures/meAppHarness.tsx");
    const { renderMySessionsAppHarness } = await import("/tests/fixtures/mySessionsAppHarness.tsx");
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
    renderMeAppHarness(document.getElementById("me-root"), {
      authSession: { user: { id: "block-list-test" } },
      blockedPlayers: [{ blockedNickname: "已封鎖球友 <b>", blockedProfileId: 92, createdAt: "2026-08-03T01:00:00Z" }],
      blockedPlayersStatus: "ready",
      onUnblockPlayer: (profileId) => window.__myChatActions.push(["unblock", profileId]),
    });
    renderMySessionsAppHarness(root, {
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
  await expect
    .poll(() => page.evaluate(() => window.__myChatActions))
    .toEqual([
      ["chat", "8201"],
      ["unblock", "92"],
    ]);
});

test("the create form asks about the venue situation and offers three play types and slot buttons", async ({
  page,
}) => {
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

test("edit sheet expands advanced settings by default when the session already has NTRP, fee note, or notes", async ({
  page,
}) => {
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
    const { renderMeAppHarness } = await import("/tests/fixtures/meAppHarness.tsx");
    const root = document.getElementById("me-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("me-page").hidden = false;
    const courts = [
      { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
      { city: "台北市", district: "中山區", id: 9, name: "第二球場" },
      { city: "台北市", district: "萬華區", id: 10, name: "第三球場" },
    ];
    renderMeAppHarness(root, {
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
    const { renderMeAppHarness } = await import("/tests/fixtures/meAppHarness.tsx");
    const root = document.getElementById("me-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("me-page").hidden = false;
    // 球場目錄還沒載入：交集必然是 0，但那不代表使用者「訂閱了 0 座」。
    renderMeAppHarness(root, { authSession: { user: { id: "empty-courts-test" } }, courts: [] });
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
    const { openFilterSheet } = await window.__importAppModule("sessionViews");
    const { MOCK_SESSIONS, COURTS } = await window.__importAppModule("mockData");
    const { filterSessions, DEFAULT_FILTER_STATE } = await window.__importAppModule("filters");
    const { renderNearbyDrawerAppHarness } = await import("/tests/fixtures/nearbyDrawerAppHarness.tsx");

    // 獨立、脫離真實 controller publish 週期的抽屜節點：避免 mock 2.5 秒 discovery
    // delay 之後真實 controller 重繪蓋掉這裡的斷言，見 task-2-report concerns。
    const drawerRoot = document.createElement("div");
    drawerRoot.id = "filter-sheet-test-drawer";
    document.body.appendChild(drawerRoot);

    let testFilters = { ...DEFAULT_FILTER_STATE, types: new Set(), districts: new Set() };
    window.__filterSheetSummaries = [];
    const drawerHarness = renderNearbyDrawerAppHarness(drawerRoot, {
      courts: COURTS,
      filters: testFilters,
      sessions: filterSessions(MOCK_SESSIONS, testFilters),
    });
    const renderDrawer = () => {
      drawerHarness.update({
        sessions: filterSessions(MOCK_SESSIONS, testFilters),
        filters: testFilters,
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
    await page.evaluate(
      () =>
        document.activeElement ===
        document.querySelector('#filters-sheet [data-filter="districts"][data-value="內湖區"]')
    )
  ).toBe(true);

  // 鍵盤操作打法 chip 也不可把焦點丟到 body（批 B Task 4 的教訓：async 重繪吃焦點）。
  await page.evaluate(() => document.querySelector('#filters-sheet [data-filter="types"][data-value="單打"]').focus());
  await page.keyboard.press("Enter");
  expect(
    await page.evaluate(() => ({
      isBody: document.activeElement === document.body,
      isChip:
        document.activeElement === document.querySelector('#filters-sheet [data-filter="types"][data-value="單打"]'),
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
