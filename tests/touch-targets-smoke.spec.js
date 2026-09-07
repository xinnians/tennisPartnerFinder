import { expect, test } from "@playwright/test";

import { installAppModuleImporter, installAppTestHooks } from "./fixtures/appRuntime.js";
import { installFakeMaps } from "./fixtures/fakeMaps.js";

test.beforeEach(async ({ page }) => installAppModuleImporter(page));

function createTouchTargetScanner(page) {
  return async (root) =>
    page.locator(root).evaluateAll((roots) => {
      const effectiveBox = (element) => {
        const box = element.getBoundingClientRect();
        const before = getComputedStyle(element, "::before");
        if (before.content === "none" || (before.position !== "absolute" && before.position !== "fixed")) return box;
        const expand = (value) => Math.max(0, -(Number.parseFloat(value) || 0));
        return {
          height: box.height + expand(before.top) + expand(before.bottom),
          width: box.width + expand(before.left) + expand(before.right),
        };
      };

      return roots
        .flatMap((node) => [
          ...node.querySelectorAll("button, a[href], input, select, textarea, label, [role='switch']"),
        ])
        .filter((element) => element.checkVisibility())
        .filter((element) => !element.matches(":disabled"))
        .filter((element) => {
          const wrappingLabel = element.closest("label");
          if (element.tagName !== "LABEL" && wrappingLabel && wrappingLabel !== element) return false;
          return element.tagName !== "LABEL" || Boolean(element.querySelector("input, select, textarea"));
        })
        .map((element) => {
          const box = effectiveBox(element);
          return {
            height: Math.round(box.height * 100) / 100,
            name:
              element.getAttribute("aria-label") ||
              element.getAttribute("data-testid") ||
              element.id ||
              element.textContent?.trim().replace(/\s+/gu, " ") ||
              element.tagName.toLowerCase(),
            width: Math.round(box.width * 100) / 100,
          };
        });
    });
}

async function expectTouchTargets(page, root, minimumCount, message) {
  const measure = createTouchTargetScanner(page);
  await expect
    .poll(async () => (await measure(root)).length, { message: `${message}掃描集不得為空` })
    .toBeGreaterThanOrEqual(minimumCount);
  await expect
    .poll(async () => (await measure(root)).filter(({ height, width }) => height < 44 || width < 44), {
      message: `${message}全部點擊目標必須至少 44×44px`,
    })
    .toEqual([]);
}

test("production discovery and dialog surfaces keep audited touch targets at least 44px", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#level-chip").click();
  await expectTouchTargets(page, "#level-popover", 5, "程度快選");
  await page.keyboard.press("Escape");

  await page.evaluate(async () => {
    const { renderMapDataStatus } = await window.__importAppModule("views/discoverySurfaceViews");
    renderMapDataStatus(document.getElementById("map-data-status"), {
      kind: "error",
      message: "球局資料暫時無法載入。",
    });
  });
  await expectTouchTargets(page, "#map-data-status", 1, "地圖錯誤狀態");

  await page.evaluate(async () => {
    const { renderNearbyDrawerAppHarness } = await import("/tests/fixtures/nearbyDrawerAppHarness.tsx");
    renderNearbyDrawerAppHarness(document.getElementById("nearby-sessions-drawer"), {
      drawerState: "open",
      mapStatus: { kind: "error", message: "球局資料暫時無法載入。" },
    });
  });
  await expectTouchTargets(page, "#nearby-sessions-drawer", 3, "附近球局錯誤狀態");

  await page.evaluate(async () => {
    const { openLoginModal } = await window.__importAppModule("sheets");
    openLoginModal();
  });
  await expectTouchTargets(page, "#login-dialog", 2, "登入視窗");
  await page.keyboard.press("Escape");

  await page.evaluate(async () => {
    const { openReportDialog } = await window.__importAppModule("views/sessionSurfaceViews");
    openReportDialog({ targetLabel: "青年公園網球場 · 週六上午" });
  });
  await expectTouchTargets(page, "#report-dialog", 6, "檢舉視窗");
  await page.keyboard.press("Escape");

  await page.evaluate(async () => {
    const { openSessionChatSheet } = await window.__importAppModule("views/sessionSurfaceViews");
    const { createChatFeedHarness } = await import("/tests/fixtures/chatFeedHarness.ts");
    const chatFeed = createChatFeedHarness();
    openSessionChatSheet(
      {
        court: "青年公園網球場",
        courtDistrict: "萬華區",
        playType: "雙打",
        sessionId: 8812,
        startAt: "2099-07-19T01:00:00.000Z",
        status: "open",
      },
      { canWithdraw: true, feed: chatFeed.feed }
    );
    chatFeed.publish({ messages: [], status: "ready" });
  });
  await expectTouchTargets(page, "#session-chat-sheet", 4, "聊天室");
});

test("My Sessions segments and card actions keep audited touch targets at least 44px", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { renderMySessionsAppHarness } = await import("/tests/fixtures/mySessionsAppHarness.tsx");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    const session = {
      canConfirmAttendance: true,
      canConfirmPlayed: true,
      canWithdraw: true,
      court: "青年公園網球場",
      courtDistrict: "萬華區",
      hostNickname: "主揪",
      hostNtrp: 3.5,
      ntrpMax: 4,
      ntrpMin: 3,
      playType: "雙打",
      sessionId: 8103,
      slotsRemaining: 1,
      startAt: "2099-08-03T10:00:00+08:00",
      status: "open",
      viewerParticipantStatus: "accepted",
      viewerPlayedConfirmed: false,
      viewerRole: "guest",
    };
    window.__touchTargetMySessionsHarness = renderMySessionsAppHarness(document.getElementById("my-sessions-root"), {
      authenticated: true,
      groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [session] },
    });
  });
  await expectTouchTargets(page, "#my-sessions-root", 10, "我的球局／已加入");

  await page.evaluate(() => {
    const session = {
      canCancel: true,
      court: "青年公園網球場",
      courtDistrict: "萬華區",
      hostNickname: "主揪",
      hostNtrp: 3.5,
      ntrpMax: 4,
      ntrpMin: 3,
      playType: "雙打",
      sessionId: 8201,
      slotsRemaining: 1,
      startAt: "2099-08-04T10:00:00+08:00",
      status: "open",
      venueType: "booked",
      viewerParticipantStatus: "accepted",
      viewerRole: "host",
    };
    window.__touchTargetMySessionsHarness.update({
      authenticated: true,
      groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [session] },
    });
  });
  await page.getByTestId("my-sessions-seg-hosted").click();
  await expectTouchTargets(page, "#my-sessions-root", 9, "我的球局／主揪");

  await page.evaluate(() => {
    const session = {
      court: "青年公園網球場",
      courtDistrict: "萬華區",
      hostNickname: "邀請主揪",
      hostNtrp: 3.5,
      ntrpMax: 4,
      ntrpMin: 3,
      playType: "雙打",
      sessionId: 8301,
      slotsRemaining: 1,
      startAt: "2099-08-05T10:00:00+08:00",
      status: "open",
      viewerParticipantStatus: "invited",
      viewerRole: "guest",
    };
    window.__touchTargetMySessionsHarness.update({
      authenticated: true,
      groups: { history: [], needsAction: [{ kind: "invite", session }], needsActionCount: 1, upcoming: [] },
    });
  });
  await page.getByTestId("my-sessions-seg-joined").click();
  await expectTouchTargets(page, "#my-sessions-root", 7, "我的球局／邀請");
});

test("the React error fallback close control stays at least 44px", async ({ page }) => {
  await installAppTestHooks(page, { reactRenderError: { surface: "create-session-sheet" } });
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await window.__importAppModule("views/sessionFormViews");
    openCreateSessionSheet();
  });
  await expectTouchTargets(page, "[data-testid='app-error-fallback']", 1, "React 錯誤備援");
});
