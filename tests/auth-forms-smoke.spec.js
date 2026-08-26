import { expect, test, installFakeMaps, captureConsoleErrors } from "./fixtures/smoke.js";

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

test("the login modal hides LINE by default and passes the custom provider id through when enabled", async ({
  page,
}) => {
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
      const { renderMeAppHarness } = await import("/tests/fixtures/meAppHarness.tsx");
      document.getElementById("tab-map").hidden = true;
      document.getElementById("me-page").hidden = false;
      window.__linkCalls = window.__linkCalls ?? [];
      renderMeAppHarness(document.getElementById("me-root"), {
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

test("profile and create sheets disclose public nickname use and retain a local-demo create failure", async ({
  page,
}) => {
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
test("the create form keeps date controls reachable above the sticky footer at phone height with a full catalogue", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/");

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await window.__importAppModule("sessionViews");
    openCreateSessionSheet({
      courts: Array.from({ length: 61 }, (_, index) => ({
        city: "台北市",
        id: index + 1,
        name: `示範球場 ${index + 1}`,
      })),
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
    const { renderMySessionsAppHarness } = await import("/tests/fixtures/mySessionsAppHarness.tsx");
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
    renderMySessionsAppHarness(root, {
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
    const { renderMySessionsAppHarness } = await import("/tests/fixtures/mySessionsAppHarness.tsx");
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
    renderMySessionsAppHarness(root, {
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
    const { renderMySessionsAppHarness } = await import("/tests/fixtures/mySessionsAppHarness.tsx");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    renderMySessionsAppHarness(root, {
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
    openProfileCompletionSheet({
      intent: { action: "create" },
      profile: { courts: new Set(), nick: "", ntrp: null, slots: new Set(), types: new Set() },
    });
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
    openProfileCompletionSheet({
      intent: { action: "players" },
      profile: { courts: new Set(), nick: "", ntrp: null, slots: new Set(), types: new Set() },
    });
  });
  await expect(page.locator("#profile-completion-sheet")).toContainText(
    "要查看在線球友，請填寫公開暱稱與 NTRP（1.0–7.0）。"
  );
  await page.keyboard.press("Escape");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
    openProfileCompletionSheet({
      intent: { action: "directory" },
      profile: { courts: new Set(), nick: "", ntrp: null, slots: new Set(), types: new Set() },
    });
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

  await expect
    .poll(() => page.evaluate(() => window.__walkOnCreatePayload))
    .toMatchObject({
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

  await expect
    .poll(() => page.evaluate(() => window.__collapsedCreatePayload))
    .toMatchObject({
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

test("create sheet switches to candidate mode and submits up to three candidate courts as an array", async ({
  page,
}) => {
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

  await expect
    .poll(() => page.evaluate(() => window.__stage4bCreatePayload))
    .toMatchObject({
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
  await expect
    .poll(() => page.evaluate(() => window.__blockedToasts))
    .toEqual(["先選好球場與開始時間", "先選 2–3 個候選球場與時段"]);
  expect(await page.evaluate(() => window.__blockedSubmitCount)).toBe(0);
  expect(runtimeErrors).toEqual([]);
});

test("create sheet switches to its own success page after publish and routes 查看我的球局 through onViewMySessions", async ({
  page,
}) => {
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
  await expect
    .poll(() => page.evaluate(() => window.__savedOneDecimalProfile))
    .toEqual({
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
  await expect
    .poll(() => page.evaluate(() => window.__nicknameOnlyProfile))
    .toEqual({
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

test("mock online layer uses presence pins while the full directory list opens cards and invitations", async ({
  page,
}) => {
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
    const { openCourtPlayersDrawer, openPlayerCardSheet, openPlayerDirectoryList, renderPlayerLayerToggle } =
      await window.__importAppModule("sessionViews");
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
    await controller.setAuthState(
      { user: { id: "mock-player-host" } },
      { directory: true, nickname: true, ntrp: true }
    );
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
  await expect(
    page.locator("#directory-name-injection, #directory-court-injection, #directory-type-injection")
  ).toHaveCount(0);
  await page.getByTestId("player-directory-row-8801").click();
  await expect.poll(() => page.evaluate(() => window.__escapedDirectoryPlayer)).toBe(8801);
  expect(runtimeErrors).toEqual([]);
});
