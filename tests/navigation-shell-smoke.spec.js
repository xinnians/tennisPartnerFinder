import { expect, test, installFakeMaps, captureConsoleErrors } from "./fixtures/smoke.js";

test("a hash session link opens its detail, copies a stable share link, and gives an empty state when unavailable", async ({
  baseURL,
  page,
}) => {
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

test("each main page opens directly from its tab hash", async ({ page }) => {
  await installFakeMaps(page);
  const routes = [
    ["#tab-map", "#tab-map"],
    ["#tab-my-sessions", "#my-sessions-page"],
    ["#tab-messages", "#messages-page"],
    ["#tab-me", "#me-page"],
  ];

  for (const [hash, selector] of routes) {
    await page.goto(`/${hash}`);
    await expect(page.locator(selector)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${hash}$`));
  }
});

test("a main page hash keeps its page active across reload", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/#tab-map");
  await page.getByTestId("me-tab").click();
  await expect(page).toHaveURL(/#tab-me$/);
  await expect(page.locator("#me-page")).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/#tab-me$/);
  await expect(page.locator("#me-page")).toBeVisible();
});

test("browser Back returns to the previous main page", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/#tab-map");
  await page.getByTestId("messages-tab").click();
  await expect(page).toHaveURL(/#tab-messages$/);
  await page.getByTestId("me-tab").click();
  await expect(page).toHaveURL(/#tab-me$/);

  await page.goBack();
  await expect(page).toHaveURL(/#tab-messages$/);
  await expect(page.locator("#messages-page")).toBeVisible();
});

test("the existing home logo anchor routes to the map page", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/#tab-me");
  await expect(page.locator("#me-page")).toBeVisible();

  await page.locator(".app-brand").dispatchEvent("click");
  await expect(page).toHaveURL(/#tab-map$/);
  await expect(page.locator("#tab-map")).toBeVisible();
  await expect(page.getByTestId("map-tab")).toBeFocused();
});

test("cold boot routes an anonymous page hash", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/#tab-messages");

  await expect(page.locator("#messages-page")).toBeVisible();
  await expect(page).toHaveURL(/#tab-messages$/);
  await expect(page.locator("#session-sheet")).toHaveCount(0);
});

test("cold boot opens an anonymous session hash", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/#/session/9001");

  await expect(page.locator("#session-sheet")).toBeVisible();
  await expect(page.locator("#session-sheet")).toContainText("台北網球中心");
  await expect(page).toHaveURL(/#\/session\/9001$/);
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

test("My Sessions has a bottom navigation destination and stays isolated beneath the nearby drawer", async ({
  page,
}) => {
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
test("bottom navigation renders five items in dc order and splits the badge/dot between my-sessions and messages", async ({
  page,
}) => {
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

  await page.getByTestId("messages-tab").click();
  await expect(page.locator("#messages-root .messages-page__empty")).toBeVisible();
  await expect(page.locator("#messages-root .messages-page__empty")).toContainText("成局後群組聊天會出現在這裡");

  await page.evaluate(async () => {
    const { mountMessagesAppHarness } = await import("/tests/fixtures/messagesAppHarness.tsx");
    const root = document.createElement("div");
    root.id = "messages-behavior-harness";
    document.body.append(root);
    globalThis.__messagesOpened = [];
    globalThis.__messagesHarness = mountMessagesAppHarness(root, {
      mySessions: [
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
      onOpenChat: (sessionId) => globalThis.__messagesOpened.push(sessionId),
    });
  });

  const harness = page.locator("#messages-behavior-harness");
  const unreadRow = harness.getByTestId("messages-row-601");
  const readRow = harness.getByTestId("messages-row-602");
  await expect(harness.locator(".messages-row__unread")).toHaveCount(1);
  await expect(unreadRow.locator(".messages-row__unread")).toHaveCount(1);
  await expect(readRow.locator(".messages-row__unread")).toHaveCount(0);
  // host 視角看自己主揪頭像字顯示「我」,guest 視角顯示主揪暱稱首字(dc §3)。
  await expect(readRow.locator(".messages-row__avatar")).toHaveText("我");
  await expect(unreadRow.locator(".messages-row__avatar")).toHaveText("示");
  await expect(harness.locator(".messages-page__empty")).toHaveCount(0);

  await unreadRow.click();
  await expect.poll(() => page.evaluate(() => window.__messagesOpened)).toEqual(["601"]);

  await page.evaluate(() => {
    globalThis.__messagesHarness.unmount();
    document.getElementById("messages-behavior-harness").remove();
  });
  await expect(page.locator(".messages-row")).toHaveCount(0);
  await expect(page.locator("#messages-root .messages-page__empty")).toBeVisible();
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
    const { renderMySessionsAppHarness } = await import("/tests/fixtures/mySessionsAppHarness.tsx");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    window.__renderEmptyCase = (groups) =>
      renderMySessionsAppHarness(document.getElementById("my-sessions-root"), { authenticated: true, groups });
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
