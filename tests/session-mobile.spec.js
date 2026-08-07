import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { expectScrolledIntoViewport, expectWithinViewport, installFakeMaps } from "./fixtures/fakeMaps.js";
import { courtIdByName, createProfile, setBrowserSession, signUpUser, SUPABASE_URL } from "./fixtures/localSupabase.js";
import {
  createFutureSessionInput,
  createSessionTestContext,
  createSessionViaRpc,
  inviteViaRpc,
  reviewJoinRequestViaRpc,
  setPlayerVisibilityViaRpc,
} from "./fixtures/sessionFactory.js";

test.describe.configure({ mode: "serial", timeout: 90_000 });

function captureRuntimeErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

// 對稱式掃描:掃 root 底下全部互動元素,不列舉 testid——往後新增欄位會自動納入。
// 兩條委派規則(不是白名單,是「誰才是真正的點擊目標」):
//   1. 被 <label> 包住的 input,點擊目標是那個 label,label 自己在掃描集裡量。
//   2. 不含任何表單控件的 <label>,是指向相鄰控件的純文字標籤,不是獨立目標。
// 批 C1-4:從單一「建立/編輯表單」測試抽成模組級 helper,篩選 sheet 與個人檔案 sheet 的
// 掃描共用同一套規則,不各自重寫一份容易走樣的複本。
function createTouchTargetScanner(page) {
  const measure = (root) =>
    page.locator(root).evaluateAll((roots) => {
      const targets = [];
      for (const node of roots) {
        for (const element of node.querySelectorAll("button, a[href], select, input, textarea, label, [role='switch']")) {
          if (!element.checkVisibility()) continue;
          const wrappingLabel = element.closest("label");
          if (element.tagName !== "LABEL" && wrappingLabel && wrappingLabel !== element) continue;
          if (element.tagName === "LABEL" && !element.querySelector("input, select, textarea")) continue;
          const box = element.getBoundingClientRect();
          targets.push({
            height: Math.round(box.height),
            // fix round 1:用 ?? 時,沒有 id 的元素 element.id 是空字串("")而非 null/undefined,
            // ?? 不會往下 fallback,診斷名稱就印成空字串。改用 || 讓空字串也落到下一層。
            name:
              element.getAttribute("data-testid") ||
              element.id ||
              `${element.tagName.toLowerCase()}.${element.className || "(無 class)"}`,
            width: Math.round(box.width),
          });
        }
      }
      return targets;
    });
  const undersized = async (root) =>
    (await measure(root)).filter((target) => target.width < 44 || target.height < 44);
  return { measure, undersized };
}

test("four bottom destinations fit 390px and keep every touch target at least 44px", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");

  const navigation = page.locator(".bottom-navigation");
  const items = navigation.locator(".bottom-navigation__item");
  await expect(items).toHaveCount(4);
  await expectWithinViewport(page, navigation);
  const boxes = await items.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { height: box.height, width: box.width };
    })
  );
  expect(boxes).toHaveLength(4);
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  await page.getByTestId("me-tab").click();
  await expect(page.locator("#me-page")).toBeVisible();
  await expectWithinViewport(page, page.getByTestId("me-sign-in"));
});

async function createCompleteActor(actor) {
  const { client, session } = await signUpUser(actor.email);
  const profileId = await createProfile(client, {
    courts: actor.courts,
    nickname: actor.nickname,
    ntrp: actor.ntrp,
    playTypes: actor.playTypes,
    slots: actor.slots,
  });
  return { client, profileId, session };
}

async function switchBrowserSession(page, session) {
  await setBrowserSession(page, session);
  const profileResponse = page.waitForResponse(
    (response) => response.url().includes("/rest/v1/my_profile") && response.request().method() === "GET"
  );
  await page.reload();
  await profileResponse;
}

test("a 390px user can expand discovery, resume join, and reach action-first My Sessions without overflow", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const guest = await createCompleteActor(context.guest);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(host.client, createFutureSessionInput({ courtId, slotsTotal: 1 }));

  let joinRequests = 0;
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/request_to_join_session`, async (route) => {
    joinRequests += 1;
    await route.continue();
  });
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").focus();
  await page.keyboard.press("Enter");
  const drawer = page.locator("#nearby-sessions-list");
  await expect(drawer).toBeVisible();
  await expectWithinViewport(page, drawer);
  const sessionCard = page.locator(`[data-session-id='${sessionId}']`).first();
  await sessionCard.focus();
  await page.keyboard.press("Enter");
  const sheet = page.locator("#session-sheet");
  await expect(sheet).toBeVisible();
  await expectWithinViewport(page, sheet);
  await sheet.locator("[data-session-action='primary']").click();
  await expect(page.locator("#login-dialog")).toBeVisible();
  await expectWithinViewport(page, page.locator("#login-dialog"));

  await switchBrowserSession(page, guest.session);
  const confirmation = page.locator("#join-session-confirmation");
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByTestId("session-join-form")).toBeVisible();
  await expectWithinViewport(page, confirmation);
  expect(joinRequests).toBe(0);
  await confirmation.getByTestId("join-session").click();
  await expect(confirmation).toContainText("已送出申請，等待主揪回覆。");
  await confirmation.getByRole("button", { name: "關閉確認" }).click();

  const mySessionsTab = page.getByTestId("my-sessions-tab");
  await mySessionsTab.focus();
  await page.keyboard.press("Enter");
  const waitingCard = page.locator(`#my-needs-action [data-guest-request-session='${sessionId}']`);
  await expect(waitingCard).toBeVisible();
  await expect(waitingCard).toContainText("等待主揪回覆");
  await expectWithinViewport(page, waitingCard);

  const { data: roster, error: rosterError } = await host.client
    .from("session_participant_roster")
    .select("participant_id, profile_id")
    .eq("session_id", sessionId)
    .eq("profile_id", guest.profileId)
    .single();
  if (rosterError) throw rosterError;
  await reviewJoinRequestViaRpc(host.client, { decision: "accepted", participantId: roster.participant_id, sessionId });

  await switchBrowserSession(page, guest.session);
  await mySessionsTab.focus();
  await page.keyboard.press("Enter");
  const upcomingCard = page.getByTestId(`report-session-${sessionId}`).locator("xpath=ancestor::article");
  await expect(upcomingCard).toBeVisible();
  await expect(upcomingCard).toContainText("已核准加入");
  await expect(page.getByTestId(`open-chat-${sessionId}`)).toBeVisible();
  const settledUpcomingCard = page.getByTestId(`report-session-${sessionId}`).locator("xpath=ancestor::article");
  await expectScrolledIntoViewport(page, settledUpcomingCard);
  await expect(page.getByTestId("my-sessions-tab")).toBeFocused();

  await page.getByTestId("me-tab").click();
  // 對稱式掃描：不列舉 testid，往後搬進「我」頁的控件會自動納入這道守衛。
  const meSettingControls = page.locator(
    "#me-page button, #me-page input, #me-page select, #me-page option, #me-page a[href], #me-page [role='switch']"
  );
  // 量測要能重試：切頁後版面還在收斂時取的瞬時快照會抖。
  const undersizedMeControls = async () =>
    (
      await meSettingControls.evaluateAll((elements) =>
        elements
          // 訂閱球場清單收合是合法狀態，收合中的 checkbox 量到 0×0，量它們只會噴偽紅。
          .filter((element) => element.checkVisibility())
          .map((element) => {
            // 被 label 包住的輸入框，實際觸控目標是整個 label。
            const target = element.closest("label") ?? element;
            const box = target.getBoundingClientRect();
            return {
              height: box.height,
              label: element.getAttribute("data-testid") ?? element.tagName.toLowerCase(),
              width: box.width,
            };
          })
      )
    ).filter((box) => box.width < 44 || box.height < 44);
  // 下限要組成感知：球場 checkbox 有 53 個，單一總數下限會被它們灌滿，非球場控件
  // 整組消失也偵測不到。所以分開數，且都只數看得見的（收合中的清單不算）。
  const visibleCount = (locator) =>
    locator.evaluateAll((elements) => elements.filter((element) => element.checkVisibility()).length);
  const nonCourtControls = page.locator(
    "#me-page button, #me-page a[href], #me-page select, #me-page input:not([data-notification-court])"
  );
  await expect.poll(async () => await visibleCount(nonCourtControls)).toBeGreaterThanOrEqual(15);
  await expect.poll(async () => await visibleCount(meSettingControls)).toBeGreaterThanOrEqual(15);
  await expect
    .poll(undersizedMeControls, { message: "390px 下「我」頁全部互動控件必須 ≥44×44" })
    .toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("a 390px invited player can accept the invite card and open group chat", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const player = await createCompleteActor(context.guest);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(host.client, createFutureSessionInput({ courtId, slotsTotal: 1 }));
  expect(await setPlayerVisibilityViaRpc(player.client, true)).toBe("OK");
  expect(await inviteViaRpc(host.client, sessionId, player.profileId)).toBe("OK");

  await installFakeMaps(page);
  await setBrowserSession(page, player.session);
  await page.goto("/");
  await page.getByTestId("my-sessions-tab").click();
  const invite = page.getByTestId("invite-row");
  await expect(invite).toBeVisible();
  await expectWithinViewport(page, invite);
  const accept = page.getByTestId(`accept-invite-${sessionId}`);
  await expectWithinViewport(page, accept);
  await accept.click();
  const chatButton = page.getByTestId(`open-chat-${sessionId}`);
  await expect(chatButton).toBeVisible();
  await chatButton.click();
  await expect(page.locator("#session-chat-sheet")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("the create and edit forms keep every 390px touch target at 44px", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(
    host.client,
    createFutureSessionInput({ courtId, notes: `touch-target-${context.runId}` })
  );

  await installFakeMaps(page);
  await setBrowserSession(page, host.session);
  await page.goto("/");

  const { measure, undersized } = createTouchTargetScanner(page);

  await page.getByTestId("create-session-tab").click();
  await expect(page.locator("#session-create-modal")).toBeVisible();
  await expect
    .poll(async () => (await measure("#session-create-modal")).length, { message: "建局表單掃描集不得為空" })
    .toBeGreaterThanOrEqual(12);
  await expect
    .poll(async () => await undersized("#session-create-modal"), { message: "390px 下建局表單全部點擊目標必須 ≥44×44" })
    .toEqual([]);
  await page.keyboard.press("Escape");

  await page.getByTestId("my-sessions-tab").click();
  const editButton = page.locator(`#my-upcoming-sessions [data-my-action='edit'][data-session-id='${sessionId}']`);
  await expect(editButton).toBeVisible();
  await editButton.click();
  await expect(page.locator("#session-edit-sheet")).toBeVisible();
  await expect
    .poll(async () => (await measure("#session-edit-sheet")).length, { message: "編輯表單掃描集不得為空" })
    .toBeGreaterThanOrEqual(8);
  await expect
    .poll(async () => await undersized("#session-edit-sheet"), { message: "390px 下編輯表單全部點擊目標必須 ≥44×44" })
    .toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

// 批 C1-4:批 C1-3 把 #filter-sheet-open 接上批 C1-2 的篩選 sheet,兩者過去都沒有 44px 掃描
// 覆蓋。順帶收批 B 帶走項——完成個人檔案 sheet(含常打球場 checkbox 清單)也還沒有專屬 44px
// 量測,一併補上。
test("the filter sheet open button, filter sheet controls, and profile-completion sheet keep every 390px touch target at 44px", async ({
  page,
}) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);

  await installFakeMaps(page);
  await setBrowserSession(page, host.session);
  await page.goto("/");

  const { measure, undersized } = createTouchTargetScanner(page);

  // #filter-sheet-open 是地圖工具列的主鈕,本身不在 sheet 內,獨立量測。
  const openButton = page.locator("#filter-sheet-open");
  await expect(openButton).toBeVisible();
  await expect.poll(async () => (await openButton.boundingBox())?.width).toBeGreaterThanOrEqual(44);
  await expect.poll(async () => (await openButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);

  await openButton.click();
  const filterSheet = page.locator("#filters-sheet");
  await expect(filterSheet).toBeVisible();
  // 掃描集下限 14:關閉鈕＋行政區／球場／日期三個欄位＋5 個程度按鈕＋3 個打法 chip＋3 個
  // 場地類型 chip＋清除鈕＝16,取略低的 14 留一點裕度但仍能抓到「整組消失」的回歸。
  await expect
    .poll(async () => (await measure("#filters-sheet")).length, { message: "篩選 sheet 掃描集不得為空" })
    .toBeGreaterThanOrEqual(14);
  await expect
    .poll(async () => await undersized("#filters-sheet"), { message: "390px 下篩選 sheet 全部點擊目標必須 ≥44×44" })
    .toEqual([]);
  await page.keyboard.press("Escape");

  // 完成個人檔案 sheet(standalone 模式,「我」頁的編輯入口):暱稱／NTRP／台北市 active
  // 球場 checkbox(數量 n 隨 data/courts.json 目錄增減,CLAUDE.md 明文允許常規整併)／
  // 4 個常打類型／6 個時段／儲存鈕。
  // fix round 1(PM 審查):原本掃描集下限固定 60,對現值 67(53 座球場)只留 13% 裕度——
  // 砍幾座球場就會產生與 44px 無關的假紅,不是「砍半才假紅」。改成兩層,球場數與結構控件數
  // 分開驗證:(1) 扣掉球場 checkbox 後的結構控件數(關閉鈕1＋暱稱1＋NTRP1＋常打類型4＋
  // 可打時段6＋儲存鈕1＝14)是固定值,與目錄大小無關;(2) 球場 checkbox 數 n 只要求 ≥1,
  // 確認清單真的有渲染(n=0 代表壞掉)。n 由獨立 root(`[data-profile-courts]`,球場清單專屬
  // 容器)量出,不是用總數反推,兩個數字互相獨立。
  await page.getByTestId("me-tab").click();
  await page.getByTestId("edit-profile").click();
  const profileSheet = page.locator("#profile-completion-sheet");
  await expect(profileSheet).toBeVisible();
  const courtCheckboxCount = async () => (await measure("#profile-completion-sheet [data-profile-courts]")).length;
  const structuralControlCount = async () => {
    const [total, courts] = await Promise.all([
      measure("#profile-completion-sheet").then((targets) => targets.length),
      courtCheckboxCount(),
    ]);
    return total - courts;
  };
  await expect.poll(courtCheckboxCount, { message: "球場 checkbox 掃描集不得為空" }).toBeGreaterThan(0);
  await expect
    .poll(structuralControlCount, { message: "個人檔案 sheet 非球場結構控件掃描集不得低於固定下限 14" })
    .toBeGreaterThanOrEqual(14);
  await expect
    .poll(async () => await undersized("#profile-completion-sheet"), {
      message: "390px 下個人檔案 sheet 全部點擊目標必須 ≥44×44",
    })
    .toEqual([]);
  expect(runtimeErrors).toEqual([]);
});
