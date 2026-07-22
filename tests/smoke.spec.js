import { expect, test } from "@playwright/test";
import { expectWithinViewport, installFakeMaps, setFakeMapBounds } from "./fixtures/fakeMaps.js";

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
  await page.route("**/src/mockData.js", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({
      response,
      body: `${source}\nMOCK_SESSIONS.forEach((session) => Object.assign(session, {
        lineId: "TAINT_LINE_ID",
        profileId: "TAINT_PROFILE_ID",
        hostProfileId: "TAINT_HOST_PROFILE_ID",
        realName: "TAINT_REAL_NAME",
        profileUrl: "TAINT_PROFILE_URL",
        sourceUrl: "TAINT_SOURCE_URL",
        usualCourts: "TAINT_USUAL_COURTS"
      }));`,
    });
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

test("anonymous map discovery renders only safe SessionSummary fields", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await installGeolocation(page, [{ coords: { latitude: 25.03, longitude: 121.55 } }]);
  await page.goto("/");

  await expect(page.getByRole("region", { name: "台北市球局地圖" })).toBeVisible();
  await expect(page.locator("#map")).toHaveAttribute("data-fake-google-map", "ready");
  await expect(page.locator("#use-my-location")).toBeVisible();
  await expect(page.locator("#nearby-sessions-drawer")).toBeVisible();
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#nearby-sessions-summary")).toContainText("這個地圖範圍內");
  await expect(page.locator("#nearby-sessions-list")).toBeHidden();
  await expect(page.locator("#open-session")).toBeVisible();
  await expect(page.getByTestId("player-layer-toggle")).toBeVisible();
  await expect(page.getByTestId("player-layer-toggle")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByTestId("player-layer-toggle")).toHaveText("顯示球友");
  await expect(page.locator(".chip-type").first()).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#band-options [data-band='all']")).toHaveAttribute("aria-pressed", "true");
  await page.locator(".chip-type[data-type='單打']").click();
  await expect(page.locator(".chip-type[data-type='單打']")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#level-chip").click();
  await page.locator("#band-options [data-band='mid']").click();
  await expect(page.locator("#band-options [data-band='mid']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#band-options [data-band='all']")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#filters-reset").click();
  await expect(page.locator(".chip-type[data-type='單打']")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#band-options [data-band='all']")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => window.__geolocationCallCount())).toBe(0);

  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#nearby-sessions-backdrop")).toBeVisible();
  await expect(page.locator(".app-header")).toHaveJSProperty("inert", true);
  await expect(page.locator("#map")).toHaveJSProperty("inert", true);
  await expect(page.locator("#nearby-sessions-toggle")).toHaveJSProperty("inert", true);
  await expect(page.locator("[data-nearby-close]")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#nearby-sessions-backdrop")).toBeHidden();
  await expect(page.locator(".app-header")).toHaveJSProperty("inert", false);
  await expect(page.locator("#nearby-sessions-toggle")).toHaveJSProperty("inert", false);
  await expect(page.locator("#nearby-sessions-toggle")).toBeFocused();

  await page.locator("#nearby-sessions-toggle").click();
  const firstCard = page.locator("[data-testid='session-card']").first();
  await expect(firstCard).toBeVisible();
  await expect(firstCard).toContainText("示範");
  await expect(firstCard).toContainText("NTRP");

  const exposed = await publicSurface(page).innerText();
  expect(exposed).not.toMatch(/amber\.tw|hsu_tennis|facebook\.com|ptt\.cc|LINE ID/i);
  expect(exposed).not.toMatch(/profile[_ -]?id|真名|常打球場/i);
  const markerAttributes = await page.locator(".test-marker").evaluateAll((markers) =>
    markers.map((marker) => ({ title: marker.getAttribute("title"), aria: marker.getAttribute("aria-label") }))
  );
  expect(JSON.stringify(markerAttributes)).not.toMatch(/amber|line|profile|source|http/i);
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

test("a configured support address renders a mailto contact link", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const support = page.getByRole("link", { name: "聯絡支援" });
  await expect(support).toBeVisible();
  await expect(support).toHaveAttribute("href", "mailto:support@example.test");
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
  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator(".bottom-navigation")).toHaveJSProperty("inert", true);
  await page.keyboard.press("Escape");
  await expect(page.locator(".bottom-navigation")).toHaveJSProperty("inert", false);
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
    const markerAttributes = [...document.querySelectorAll(".test-marker")].map((marker) => ({
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
      markerAttributes,
    };
  });

  const capturedJson = JSON.stringify(captured);
  for (const value of TAINTED_PUBLIC_VALUES) expect(capturedJson).not.toContain(value);
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

test("a pending join confirmation accepts only one intentional submission", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openJoinSessionConfirmation } = await import("/src/sessionViews.js");
    let releaseConfirmation;
    window.__joinConfirmationCalls = 0;
    window.__releaseJoinConfirmation = () => releaseConfirmation?.();
    const pendingConfirmation = new Promise((resolve) => {
      releaseConfirmation = resolve;
    });
    openJoinSessionConfirmation(
      { court: "示範球場", startAt: "2026-07-19T01:00:00.000Z" },
      {
        onConfirm: async (close) => {
          window.__joinConfirmationCalls += 1;
          await pendingConfirmation;
          close();
        },
      }
    );
  });

  const confirm = page.locator("#join-session-confirmation [data-confirm-join]");
  await expect(confirm).toBeVisible();
  await page.evaluate(() => {
    const button = document.querySelector("#join-session-confirmation [data-confirm-join]");
    button?.click();
    button?.click();
  });
  await expect.poll(() => page.evaluate(() => window.__joinConfirmationCalls)).toBe(1);
  await expect(confirm).toBeDisabled();
  await page.evaluate(() => window.__releaseJoinConfirmation());
  await expect(page.locator("#join-session-confirmation")).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

test("join confirmation repeats the safe summary and becomes an in-place success state", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openJoinSessionConfirmation } = await import("/src/sessionViews.js");
    openJoinSessionConfirmation(
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
        slotsRemaining: 1,
        startAt: "2026-07-19T01:00:00.000Z",
      },
      {
        onConfirm: async () => ({ joinSubmitted: true }),
        onViewMySessions: () => {
          window.__joinSuccessDestinationCalls = (window.__joinSuccessDestinationCalls ?? 0) + 1;
        },
      }
    );
  });

  const confirmation = page.locator("#join-session-confirmation");
  await expect(confirmation.getByTestId("session-join-form")).toBeVisible();
  await expect(confirmation.getByTestId("join-session")).toBeVisible();
  await expect(confirmation).toContainText("青年公園網球場 · 萬華區");
  await expect(confirmation).toContainText("單打 · NTRP 3.0–4.0 · 剩 1 位");
  await expect(confirmation).toContainText("主揪 公開主揪 · NTRP 3.5 · 檔案已完成");
  await expect(confirmation).toContainText("自備新球");
  await confirmation.getByTestId("join-session").click();
  await expect(confirmation.getByTestId("session-join-form")).toBeHidden();
  await expect(confirmation).toContainText("已送出申請，等待主揪回覆。");
  const mySessionsCta = confirmation.getByRole("button", { name: "前往我的球局" });
  await expect(mySessionsCta).toBeFocused();
  await mySessionsCta.click();
  await expect(page.locator("#join-session-confirmation")).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__joinSuccessDestinationCalls)).toBe(1);
  expect(runtimeErrors).toEqual([]);
});

test("instant join confirmation explains contact visibility and shows accepted success", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openJoinSessionConfirmation } = await import("/src/sessionViews.js");
    openJoinSessionConfirmation(
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
        slotsRemaining: 2,
        startAt: "2026-07-19T01:00:00.000Z",
      },
      {
        onConfirm: async () => ({ accepted: true, joinSubmitted: true }),
        onViewMySessions: () => {
          window.__instantJoinSuccessDestinationCalls = (window.__instantJoinSuccessDestinationCalls ?? 0) + 1;
        },
      }
    );
  });

  const confirmation = page.getByRole("dialog", { name: "直接加入這場球局？" });
  await expect(confirmation.getByRole("heading", { name: "直接加入這場球局？" })).toBeVisible();
  await expect(confirmation).toContainText("加入後你與主揪即可互相看到 LINE ID。");
  await confirmation.getByRole("button", { name: "直接加入" }).click();
  await expect(confirmation).toContainText("已加入球局！到我的球局查看聯絡方式。");
  const mySessionsCta = confirmation.getByRole("button", { name: "前往我的球局" });
  await expect(mySessionsCta).toBeFocused();
  await mySessionsCta.click();
  await expect(confirmation).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__instantJoinSuccessDestinationCalls)).toBe(1);
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions preserves the initiating action and its error across a private-page rerender", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await import("/src/sessionViews.js");
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
        groups: { history: [], needsAction: [], pendingHostRequestCount: 0, upcoming: [session] },
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

  const cancel = page.locator("[data-my-action='cancel']");
  await cancel.click();
  await expect.poll(() => page.evaluate(() => window.__mySessionActionCalls)).toBe(1);
  await page.evaluate(() => window.__rerenderMySessions());
  await expect(cancel).toBeDisabled();
  await page.evaluate(() => window.__releaseMySessionAction());
  await expect(page.locator("[data-my-sessions-error]")).toContainText("球局狀態暫時無法重新載入");
  await expect(cancel).toBeEnabled();
  await expect(cancel).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions renders an escaped invite card with stable response testids", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await import("/src/sessionViews.js");
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
      groups: { history: [], needsAction: [{ kind: "invite", session }], pendingHostRequestCount: 0, upcoming: [] },
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
    const { renderMySessionsPage } = await import("/src/sessionViews.js");
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
    const groups = { history: [], needsAction: [{ kind: "invite", session }], pendingHostRequestCount: 0, upcoming: [] };
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
  const alert = page.locator("[data-my-sessions-error]");
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
    const { renderMySessionsPage } = await import("/src/sessionViews.js");
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
        pendingHostRequestCount: 0,
        upcoming: [],
      },
    });
  });

  const history = page.locator("#my-history");
  await expect(history).toContainText("未加入");
  await expect(history).toContainText("這次參與未成立");
  await expect(history).not.toContainText("主揪婉拒");
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions renders the 球友卡 switch before needs-action and preserves pending and error state", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await import("/src/sessionViews.js");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const render = () =>
      renderMySessionsPage(root, {
        authenticated: true,
        groups: { history: [], needsAction: [], pendingHostRequestCount: 0, upcoming: [] },
        onToggleVisibility: async () => {
          window.__visibilityToggleCalls = (window.__visibilityToggleCalls ?? 0) + 1;
          await pending;
          throw new Error("球友卡設定暫時無法更新。");
        },
        profileIsPublic: false,
      });
    window.__rerenderVisibility = render;
    window.__releaseVisibility = release;
    render();
  });

  const toggle = page.getByTestId("player-visibility-toggle");
  await expect(toggle).toHaveAttribute("role", "switch");
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(toggle).toHaveText("已關閉");
  await expect(page.locator(".player-visibility")).toContainText(
    "開啟後，完成檔案的球友可在地圖上你的常打球場看到你的暱稱、NTRP 與可打時段。LINE 不會顯示。"
  );
  expect(
    await page.locator(".player-visibility").evaluate((node) => node.nextElementSibling?.querySelector("#my-needs-action") != null)
  ).toBe(true);

  await toggle.click();
  await expect.poll(() => page.evaluate(() => window.__visibilityToggleCalls)).toBe(1);
  await page.evaluate(() => window.__rerenderVisibility());
  await expect(toggle).toBeDisabled();
  await page.evaluate(() => window.__releaseVisibility());
  await expect(page.locator("[data-my-sessions-error]")).toContainText("球友卡設定暫時無法更新");
  await expect(toggle).toBeEnabled();
  await expect(toggle).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions moves focus to an updated card and scopes pending actions to the current account render", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await import("/src/sessionViews.js");
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
    const groupsWithRequest = { history: [], needsAction: [{ kind: "host-request", participant: request, session }], pendingHostRequestCount: 1, upcoming: [session] };
    const groupsAfterReview = { history: [], needsAction: [], pendingHostRequestCount: 0, upcoming: [session] };
    const render = ({ groups, onAccept = async () => {}, scopeKey }) =>
      renderMySessionsPage(root, { actionScopeKey: scopeKey, authenticated: true, groups, onAccept });

    window.__renderAfterReview = () => render({ groups: groupsAfterReview, scopeKey: "account-a" });
    render({
      groups: groupsWithRequest,
      onAccept: async () => window.__renderAfterReview(),
      scopeKey: "account-a",
    });
  });

  await page.getByTestId("accept-participant-16").click();
  await expect(page.locator("[data-open-my-session][data-session-id='732']")).toBeFocused();

  await page.evaluate(async () => {
    const { renderMySessionsPage } = await import("/src/sessionViews.js");
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
      { history: [], needsAction: [], pendingHostRequestCount: 0, upcoming: [session] },
      async () => {
        await pending;
        throw new Error("登入狀態已變更，請重新整理後再試。");
      }
    );
  });

  await page.locator("[data-my-action='withdraw'][data-session-id='733']").click();
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await import("/src/sessionViews.js");
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
      groups: { history: [], needsAction: [], pendingHostRequestCount: 0, upcoming: [session] },
    });
  });
  const accountBWithdraw = page.locator("[data-my-action='withdraw'][data-session-id='733']");
  await expect(accountBWithdraw).toBeEnabled();
  await page.evaluate(() => window.__releaseAccountAAction());
  await expect(accountBWithdraw).toBeEnabled();
  await expect(page.locator("[data-my-sessions-error]")).toBeHidden();
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
    const { openReportDialog } = await import("/src/sessionViews.js");
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

test("a pending withdrawal accepts only one intentional submission", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openSessionSheet } = await import("/src/sessionViews.js");
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
        onWithdraw: async () => {
          window.__withdrawalCalls += 1;
          await pendingWithdrawal;
        },
      }
    );
  });

  const withdraw = page.locator("#session-sheet [data-session-action='secondary']");
  await page.evaluate(() => {
    const button = document.querySelector("#session-sheet [data-session-action='secondary']");
    button?.click();
    button?.click();
  });
  await expect.poll(() => page.evaluate(() => window.__withdrawalCalls)).toBe(1);
  await expect(withdraw).toBeDisabled();
  await page.evaluate(() => window.__releaseWithdrawal());
  await expect(withdraw).toBeEnabled();
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
  const fieldOrder = await sheet.locator("[data-session-field], [data-session-action]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-session-field") ?? node.getAttribute("data-session-action"))
  );
  expect(fieldOrder).toEqual(["court", "time", "details", "host", "notes", "primary"]);
  await expectWithinViewport(page, sheet);

  await page.keyboard.press("Escape");
  await expect(firstCard).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#nearby-sessions-toggle")).toBeFocused();
  await page.locator("#date-filter").fill("2099-01-01");
  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#discovery-empty")).toBeVisible();
  await expect(page.locator("#discovery-empty")).toContainText("這個範圍暫時沒有可加入的球局");
  await expect(page.locator("#discovery-retry")).toBeVisible();
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
  const markerOptions = await page.evaluate(() => window.__fakeMapsSnapshot().visibleMarkerOptions);
  expect(markerOptions.every((marker) => marker.optimized === false)).toBe(true);

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
    const views = await import("/src/sessionViews.js");
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
    const views = await import("/src/sessionViews.js");
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
    const views = await import("/src/sessionViews.js");
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

test("player invitation form escapes session fields and is pending-safe across success, errors, and stale surfaces", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const views = await import("/src/sessionViews.js");
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
    const views = await import("/src/sessionViews.js");
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
    const views = await import("/src/sessionViews.js");
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
    const views = await import("/src/sessionViews.js");
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
    const { createSessionController } = await import("/src/sessionController.js");
    const views = await import("/src/sessionViews.js");
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
        loadPlayerDirectory: async () => [player],
      },
      openCourtPlayersDrawer: views.openCourtPlayersDrawer,
      openPlayerCard: views.openPlayerCardSheet,
    });
    await controller.setAuthState({ user: { id: "host" } }, { complete: true });
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

test("390px map controls keep the player layer and status below the wrapped toolbar", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderPlayerLayerToggle } = await import("/src/sessionViews.js");
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
  expect(playerControl.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height + 8);
  expect(mapStatus.y).toBeGreaterThanOrEqual(playerControl.y + playerControl.height + 8);
  expect(runtimeErrors).toEqual([]);
});

test("medium-width map status stays below the complete player layer control", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await page.setViewportSize({ width: 550, height: 844 });
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderPlayerLayerToggle } = await import("/src/sessionViews.js");
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
  expect(mapStatus.y).toBeGreaterThanOrEqual(playerControl.y + playerControl.height + 8);
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
    const { openLoginModal } = await import("/src/sheets.js");
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

test("the login modal titles each gate entry point instead of always naming a join request", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const openLoginFor = async (action) => {
    await page.evaluate(async (nextAction) => {
      const { openLoginModal } = await import("/src/sheets.js");
      openLoginModal(nextAction === null ? {} : { action: nextAction });
    }, action);
  };

  for (const [action, title] of [
    ["join", "登入以申請加入球局"],
    ["create", "登入以開球局"],
    ["players", "登入以查看球友"],
    ["my-sessions", "登入以查看你的球局"],
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
    const { openProfileCompletionSheet } = await import("/src/sessionViews.js");
    openProfileCompletionSheet({
      courts: [{ city: "台北市", id: 8, name: "示範球場" }],
      profile: { courts: new Set(), lineId: "", nick: "", ntrp: 3.5, slots: new Set(["we-m"]), types: new Set() },
      returnSession: { court: "示範球場", startAt: "2026-07-18T01:30:00.000Z" },
    });
  });

  const disclosure =
    "開球局後，這個暱稱與你的 NTRP 會顯示給瀏覽該球局的人；LINE ID 只會在同一球局的主揪與已接受球友之間互相顯示。";
  const profile = page.locator("#profile-completion-sheet");
  await expect(profile).toBeVisible();
  await expect(profile.getByLabel("公開暱稱")).toBeVisible();
  await expect(profile.getByText(disclosure)).toBeVisible();
  await expect(profile.getByText("只有同一球局的主揪與已接受球友之間可看見彼此的 LINE ID。")).toBeVisible();
  await expect(profile).toContainText("完成後將回到：示範球場・");
  await page.keyboard.press("Escape");

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await import("/src/sessionViews.js");
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
  const requiredOrder = await form
    .locator("[data-testid='session-court'], [data-testid='session-start-at'], [data-testid='session-play-type'], [data-testid='session-slots-total']")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid")));
  expect(requiredOrder).toEqual(["session-court", "session-start-at", "session-play-type", "session-slots-total"]);

  await form.getByTestId("session-court").selectOption("8");
  await form.getByTestId("session-start-at").fill("2099-07-18T09:30");
  await form.getByTestId("session-play-type").selectOption("單打");
  await form.getByTestId("session-slots-total").selectOption("1");
  await form.getByTestId("session-submit").click();
  await expect(form.getByRole("alert")).toContainText("本機示範資料僅供瀏覽");
  await expect(createSheet).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("delayed Taipei court options hydrate open profile and create forms without losing drafts", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await import("/src/sessionViews.js");
    window.__delayedProfileSheet = openProfileCompletionSheet({
      courts: [],
      courtsReady: false,
      profile: { courts: new Set(), lineId: "", nick: "", ntrp: 3.5, slots: new Set(["we-m"]), types: new Set() },
    });
  });
  const profile = page.locator("#profile-completion-sheet");
  const profileCourts = profile.getByLabel("常打球場");
  await expect(profileCourts).toBeDisabled();
  await profile.getByLabel("公開暱稱").fill("草稿球友");
  await profile.getByLabel("LINE ID").fill("draft-line-id");
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
  await expect(profileCourts).toBeEnabled();
  await expect(profileCourts.locator("option")).toHaveText(["示範球場"]);
  await expect(profile.getByLabel("公開暱稱")).toHaveValue("草稿球友");
  await expect(profile.getByLabel("LINE ID")).toHaveValue("draft-line-id");
  await expect(profile.getByLabel("單打", { exact: true })).toBeChecked();
  await profileCourts.selectOption("8");
  await page.evaluate(() =>
    window.__delayedProfileSheet.setCourts(
      [
        { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
        { city: "台北市", district: "中山區", id: 10, name: "第二球場" },
      ],
      { ready: true }
    )
  );
  await expect(profileCourts.locator("option:checked")).toHaveText(["示範球場"]);
  await page.keyboard.press("Escape");

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await import("/src/sessionViews.js");
    window.__delayedCreateSheet = openCreateSessionSheet({ courts: [], courtsReady: false });
  });
  const create = page.locator("#session-create-modal");
  const form = create.getByTestId("session-form");
  const createCourts = form.getByTestId("session-court");
  await expect(createCourts).toBeDisabled();
  await form.getByTestId("session-start-at").fill("2099-07-18T09:30");
  await form.getByTestId("session-play-type").selectOption("單打");
  await form.getByTestId("session-slots-total").selectOption("2");
  await form.locator("#session-ntrp-min").fill("3.0");
  await form.locator("#session-ntrp-max").fill("4.0");
  await form.locator("#session-notes").fill("保留這段草稿");
  await page.evaluate(() =>
    window.__delayedCreateSheet.setCourts(
      [
        { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
        { city: "新北市", district: "新店區", id: 9, name: "不應出現球場" },
      ],
      { ready: true }
    )
  );
  await expect(createCourts).toBeEnabled();
  await expect(createCourts.locator("option")).toHaveText(["請選擇球場", "示範球場 · 大安區"]);
  await expect(form.getByTestId("session-start-at")).toHaveValue("2099-07-18T09:30");
  await expect(form.getByTestId("session-play-type")).toHaveValue("單打");
  await expect(form.getByTestId("session-slots-total")).toHaveValue("2");
  await expect(form.locator("#session-ntrp-min")).toHaveValue("3.0");
  await expect(form.locator("#session-ntrp-max")).toHaveValue("4.0");
  await expect(form.locator("#session-notes")).toHaveValue("保留這段草稿");
  await createCourts.selectOption("8");
  await page.evaluate(() =>
    window.__delayedCreateSheet.setCourts(
      [
        { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
        { city: "台北市", district: "中山區", id: 10, name: "第二球場" },
      ],
      { ready: true }
    )
  );
  await expect(createCourts).toHaveValue("8");
  expect(runtimeErrors).toEqual([]);
});

test("mock-mode create does not open OAuth or fabricate a new session", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  const initialCardCount = await page.getByTestId("session-card").count();

  await page.locator("#open-session").click();
  await expect(page.locator("#toast-root")).toContainText("本機示範資料僅供瀏覽");
  await expect(page.locator("#login-dialog")).toBeHidden();
  await expect(page.getByTestId("session-card")).toHaveCount(initialCardCount);
  expect(runtimeErrors).toEqual([]);
});

test("mock player layer renders directory pins and cards while the signed-out entry stays behind the demo login gate", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.getByTestId("player-layer-toggle").click();
  await expect(page.locator("#toast-root")).toContainText("本機示範資料僅供瀏覽");

  await page.evaluate(async () => {
    const { renderPlayerPins } = await import("/src/map.js");
    const { createDataApi } = await import("/src/dataApi.js");
    const { createSessionController } = await import("/src/sessionController.js");
    const { openCourtPlayersDrawer, openPlayerCardSheet, renderPlayerLayerToggle } = await import("/src/sessionViews.js");
    const map = new window.google.maps.Map(document.getElementById("map"), {
      center: { lat: 25.05, lng: 121.53 },
      zoom: 12,
    });
    let playerMarkers = [];
    let controller;
    controller = createSessionController({
      api: createDataApi(),
      openCourtPlayersDrawer,
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
    await controller.setAuthState({ user: { id: "mock-player-host" } }, { complete: true });
    await controller.togglePlayerLayer();
  });

  await expect(page.getByTitle("球友 · 台北網球中心 · 2 位")).toBeVisible();
  await page.getByTitle("球友 · 台北網球中心 · 2 位").click();
  const playerCard = page.getByTestId("court-player-card-8001");
  await expect(playerCard).toContainText("示範山嵐");
  await playerCard.click();
  await expect(page.locator("#player-card-sheet")).toContainText("示範山嵐");
  expect(runtimeErrors).toEqual([]);
});
