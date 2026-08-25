import { expect, test, installFakeMaps, captureConsoleErrors } from "./fixtures/smoke.js";

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

test("Me owns player visibility while My Sessions omits both moved settings and preserves pending and error state", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { preloadNonHomeViews, renderMePage, renderMySessionsPage } = await window.__importAppModule("sessionViews");
    await preloadNonHomeViews(["me", "mySessions"]);
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
        .evaluateAll(
          (nodes, order) => nodes.map((node) => [...node.classList].find((name) => order.includes(name))),
          ME_SECTION_ORDER
        )
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

test("Me presence settings explain reciprocal visibility, request sharing, and offer one-tap hiding", async ({
  page,
}) => {
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
  await expect
    .poll(() => page.evaluate(() => window.__savedNotificationPreferences))
    .toEqual({
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
  await expect
    .poll(() => page.evaluate(() => window.__savedElevenCourts))
    .toEqual(Array.from({ length: 11 }, (_, index) => index + 1));
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

test("My Sessions moves focus to an updated card and scopes pending actions to the current account render", async ({
  page,
}) => {
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
    const groupsWithRequest = {
      history: [],
      needsAction: [{ kind: "host-request", participant: request, session }],
      needsActionCount: 1,
      upcoming: [session],
    };
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
    render("account-a", { history: [], needsAction: [], needsActionCount: 0, upcoming: [session] }, async () => {
      await pending;
      throw new Error("登入狀態已變更，請重新整理後再試。");
    });
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
    const { openSessionSheet, openWithdrawSessionConfirmation, preloadNonHomeViews } =
      await window.__importAppModule("sessionViews");
    await preloadNonHomeViews("withdraw");
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
