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

test("the create form's venue and slot options keep 44px touch targets at 390px", async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page);
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);

  await installFakeMaps(page);
  await setBrowserSession(page, host.session);
  await page.goto("/");
  await page.getByTestId("create-session-tab").click();
  const createSheet = page.locator("#session-create-modal");
  await expect(createSheet).toBeVisible();

  // 另立一條守衛而不是擴充「我」頁那條：兩者 root 不同、開啟前提不同，混在一起會讓失敗歸因困難。
  // 範圍是本批改寫的兩組選項，掃區塊內全部 label 而不列舉 testid——往後這兩組加選項會自動納入。
  // 建局表單其餘控件（關閉鈕、球場 select、現在開打）本來就不足 44px，那是既有缺口，不在本批範圍。
  const controls = createSheet.locator(".option-grid--stacked label, .slots-options label");
  const undersized = async () =>
    (
      await controls.evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return {
            height: Math.round(box.height),
            label: element.querySelector("input")?.getAttribute("data-testid") ?? element.tagName.toLowerCase(),
            width: Math.round(box.width),
          };
        })
      )
    ).filter((box) => box.width < 44 || box.height < 44);

  await expect.poll(async () => await controls.count()).toBeGreaterThanOrEqual(6);
  await expect
    .poll(undersized, { message: "390px 下建局表單全部互動控件必須 ≥44×44" })
    .toEqual([]);
  expect(runtimeErrors).toEqual([]);
});
