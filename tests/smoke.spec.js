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
  await expect(page.locator(".chip-venue").first()).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#band-options [data-band='all']")).toHaveAttribute("aria-pressed", "true");
  await page.locator(".chip-type[data-type='單打']").click();
  await expect(page.locator(".chip-type[data-type='單打']")).toHaveAttribute("aria-pressed", "true");
  await page.locator(".chip-venue[data-venue-type='candidates']").click();
  await expect(page.locator(".chip-venue[data-venue-type='candidates']")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#level-chip").click();
  await page.locator("#band-options [data-band='mid']").click();
  await expect(page.locator("#band-options [data-band='mid']")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#band-options [data-band='all']")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#filters-reset").click();
  await expect(page.locator(".chip-type[data-type='單打']")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".chip-venue[data-venue-type='candidates']")).toHaveAttribute("aria-pressed", "false");
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

test("an undecided candidate session renders two dashed map pins from the court catalogue", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");

  await expect
    .poll(async () => {
      const options = await page.evaluate(() => window.__fakeMapsSnapshot().visibleMarkerOptions);
      return options.filter(({ title }) => title?.includes("未定"));
    })
    .toHaveLength(2);
  const markerOptions = await page.evaluate(() => window.__fakeMapsSnapshot().visibleMarkerOptions);
  const undecided = markerOptions.filter(({ title }) => title?.includes("未定"));
  expect(undecided.map(({ title }) => title).sort()).toEqual([
    "球局 · 百齡河濱公園網球場 · 未定",
    "球局 · 美堤河濱公園網球場 · 未定",
  ]);
  expect(undecided.every(({ iconUrl }) => decodeURIComponent(iconUrl).includes('stroke-dasharray="5 4"'))).toBe(true);
  const mockCandidateOverlap = await page.evaluate(async () => {
    const { MOCK_SESSIONS } = await import("/src/mockData.js");
    const undecidedSession = MOCK_SESSIONS.find(({ sessionId }) => sessionId === 9005);
    const decidedSession = MOCK_SESSIONS.find(({ sessionId }) => sessionId === 9006);
    return undecidedSession.candidateCourtIds.includes(decidedSession.courtId);
  });
  expect(mockCandidateOverlap).toBe(false);
});

test("decision sheet waits for the court catalogue and renders candidate buttons after refill", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openDecideSessionSheet } = await import("/src/sessionViews.js");
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
    const { COURTS } = await import("/src/mockData.js");
    window.__stage4cDecisionSheet.setCourts(COURTS, { ready: true });
  });
  await expect(sheet.locator("[data-decide-court]")).toHaveCount(2);
  await expect(sheet.getByRole("button", { name: "百齡河濱公園網球場" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "美堤河濱公園網球場" })).toBeVisible();
  await expect(sheet.locator("[data-decision-terminal]")).toBeHidden();
});

test("a hash session link opens its detail, copies a stable share link, and gives an empty state when unavailable", async ({ page }) => {
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
  await expect.poll(() => page.evaluate(() => window.__copiedSessionLink)).toBe("http://127.0.0.1:5174/#/session/9001");
  await expect(page.locator("#toast-root")).toContainText("球局連結已複製");

  await page.goto("/#/session/999999");
  await expect(page.locator("#session-unavailable-sheet")).toBeVisible();
  await expect(page.locator("#session-unavailable-sheet")).toContainText("找不到這個球局");
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

test("ongoing session 9001 shows its badge and elapsed time on card and detail", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  const ongoingCard = page.locator("[data-session-id='9001']").first();
  await expect(ongoingCard.locator(".session-badge--ongoing")).toHaveText("進行中");
  await expect(ongoingCard).toContainText(/已開打 \d+ 分鐘/);
  await ongoingCard.click();

  const detail = page.locator("#session-sheet");
  await expect(detail.locator(".session-badge--ongoing")).toHaveText("進行中");
  await expect(detail).toContainText(/已開打 \d+ 分鐘/);
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

test("authenticated pre-join roster renders host first with escaped names, NTRP fallback, and avatar fallback", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openJoinSessionConfirmation, openSessionSheet } = await import("/src/sessionViews.js");
    const session = {
      court: "青年公園網球場",
      courtDistrict: "萬華區",
      hostNickname: "公開主揪",
      hostNtrp: 3.5,
      hostProfileComplete: true,
      notes: "安全名單測試",
      ntrpMax: 4,
      ntrpMin: 3,
      playType: "單打",
      sessionId: 881,
      slotsRemaining: 1,
      startAt: "2099-07-19T01:00:00.000Z",
    };
    const participants = [
      { avatarUrl: "", nickname: "<img src=x onerror=alert(1)>", ntrp: null, role: "guest", sessionId: 881 },
      {
        avatarUrl: "https://lh3.googleusercontent.com/a/stage-t45-host",
        nickname: "名單主揪",
        ntrp: 3.5,
        role: "host",
        sessionId: 881,
      },
    ];
    const detail = openSessionSheet(session, { action: { label: "申請加入" }, showJoinPreview: true });
    detail.setJoinPreview({ participants, status: "ready" });
    window.__joinPreviewDetailText = document.querySelector("#session-sheet [data-session-join-preview]")?.textContent;
    window.__joinPreviewDetailNestedAttack = Boolean(
      document.querySelector("#session-sheet [data-session-join-preview] img[src='x']")
    );
    detail.close({ restoreFocus: false });

    const confirmation = openJoinSessionConfirmation(session, { showJoinPreview: true });
    confirmation.setJoinPreview({ participants, status: "ready" });
  });

  expect(await page.evaluate(() => window.__joinPreviewDetailText)).toContain("名單主揪");
  expect(await page.evaluate(() => window.__joinPreviewDetailNestedAttack)).toBe(false);
  const preview = page.locator("#join-session-confirmation [data-session-join-preview]");
  await expect(preview).toContainText("已確認參加者");
  await expect(preview.locator("[data-join-preview-person]").first()).toContainText("主揪");
  await expect(preview.locator("[data-join-preview-person]").nth(1)).toContainText("尚未填寫 NTRP");
  await expect(preview).toContainText("<img src=x onerror=alert(1)>");
  await expect(preview.locator("img[src='x']")).toHaveCount(0);

  const hostImage = preview.locator("[data-join-preview-person]").first().locator("img");
  await expect(hostImage).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/stage-t45-host");
  await hostImage.dispatchEvent("error");
  await expect(preview.locator("[data-join-preview-person]").first().locator("[data-avatar-fallback]")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("profile completion previews the current Google avatar and explains that it cannot be customized", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await import("/src/sessionViews.js");
    openProfileCompletionSheet({
      avatarUrl: "https://lh5.googleusercontent.com/a/stage-t45-self",
      profile: { courts: new Set(), nick: "本人", ntrp: null, slots: new Set(), types: new Set() },
    });
  });

  const sheet = page.locator("#profile-completion-sheet");
  await expect(sheet.getByText("使用 Google 頭像，無法自訂")).toBeVisible();
  const avatar = sheet.locator("[data-profile-avatar] img");
  await expect(avatar).toHaveAttribute("src", "https://lh5.googleusercontent.com/a/stage-t45-self");
  await avatar.dispatchEvent("error");
  await expect(sheet.locator("[data-profile-avatar] [data-avatar-fallback]")).toBeVisible();
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

test("join confirmation distinguishes both requested NTRP outcomes without losing success focus", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  for (const [outcome, message] of [
    ["OK_NTRP_MISSING", "已送出申請；補填 NTRP 後可更清楚確認程度是否合適。"],
    ["OK_NTRP_OUT_OF_RANGE", "已送出申請；你的 NTRP 不在球局設定範圍內，等待主揪回覆。"],
  ]) {
    await page.evaluate(async (nextOutcome) => {
      const { openJoinSessionConfirmation } = await import("/src/sessionViews.js");
      openJoinSessionConfirmation(
        {
          court: "示範球場",
          courtDistrict: "大安區",
          hostNickname: "公開主揪",
          hostNtrp: 3.5,
          hostProfileComplete: true,
          joinMode: "instant",
          ntrpMax: 4,
          ntrpMin: 3,
          playType: "單打",
          slotsRemaining: 1,
          startAt: "2099-07-19T01:00:00.000Z",
        },
        { onConfirm: async () => ({ accepted: false, joinSubmitted: true, outcome: nextOutcome }) }
      );
    }, outcome);

    const confirmation = page.locator("#join-session-confirmation");
    await confirmation.getByTestId("join-session").click();
    await expect(confirmation.getByText(message)).toBeVisible();
    await expect(confirmation.getByRole("button", { name: "前往我的球局" })).toBeFocused();
    await page.keyboard.press("Escape");
  }
  expect(runtimeErrors).toEqual([]);
});

test("candidate session cards and details resolve every court until Boolean decidedAt becomes true", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const candidateSession = {
    candidateCourtIds: [8, 9, 10],
    court: "示範球場",
    courtDistrict: "大安區",
    decidedAt: "",
    feeNote: "每人 150 元",
    hostNickname: "公開主揪",
    hostNtrp: 3.5,
    hostProfileComplete: true,
    joinMode: "approval",
    ntrpMax: 4,
    ntrpMin: 3,
    notes: "候選局測試",
    playType: "雙打",
    rangeEnd: "2099-07-19T05:00:00.000Z",
    sessionId: 8801,
    slotsRemaining: 2,
    startAt: "2099-07-19T01:00:00.000Z",
    status: "open",
    venueType: "candidates",
  };
  const courts = [
    { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
    { city: "台北市", district: "中山區", id: 9, name: "第二球場" },
    { city: "台北市", district: "萬華區", id: 10, name: "第三球場" },
  ];
  await page.evaluate(
    async ({ candidateSession: session, courts: catalogue }) => {
      const { openSessionSheet, renderNearbySessionsDrawer } = await import("/src/sessionViews.js");
      renderNearbySessionsDrawer(document.getElementById("nearby-sessions-drawer"), {
        courts: catalogue,
        expanded: true,
        sessions: [session],
      });
      openSessionSheet(session, { action: { label: "申請加入" }, courts: catalogue });
    },
    { candidateSession, courts }
  );

  const card = page.getByTestId("session-card");
  const detail = page.locator("#session-sheet");
  for (const surface of [card, detail]) {
    await expect(surface).toContainText("候選局");
    await expect(surface).toContainText("示範球場、第二球場、第三球場");
    await expect(surface).toContainText("每人 150 元");
    await expect(surface).not.toContainText("已定案");
  }
  await page.keyboard.press("Escape");

  await page.evaluate(
    async ({ candidateSession: session, courts: catalogue }) => {
      const { openSessionSheet } = await import("/src/sessionViews.js");
      openSessionSheet(
        {
          ...session,
          court: "第三球場",
          courtDistrict: "萬華區",
          decidedAt: "2099-07-18T08:00:00.000Z",
          startAt: "2099-07-19T03:00:00.000Z",
        },
        { action: { label: "申請加入" }, courts: catalogue }
      );
    },
    { candidateSession, courts }
  );
  const decided = page.locator("#session-sheet");
  await expect(decided).toContainText("第三球場 · 萬華區");
  await expect(decided).toContainText("已定案");
  await expect(decided).not.toContainText("第二球場");
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

test("My Sessions renders the 球友卡 and notification settings before needs-action and preserves pending and error state", async ({ page }) => {
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
    await page.locator(".player-visibility").evaluate((node) => node.nextElementSibling?.classList.contains("presence-settings") === true)
  ).toBe(true);
  expect(
    await page.locator(".presence-settings").evaluate((node) => node.nextElementSibling?.classList.contains("notification-settings") === true)
  ).toBe(true);
  expect(
    await page.locator(".notification-settings").evaluate((node) => node.nextElementSibling?.classList.contains("blocked-player-settings") === true)
  ).toBe(true);
  expect(
    await page.locator(".blocked-player-settings").evaluate((node) => node.nextElementSibling?.querySelector("#my-needs-action") != null)
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

test("My Sessions presence settings explain reciprocal visibility, request sharing, and offer one-tap hiding", async ({ page }) => {
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
      groups: { history: [], needsAction: [], pendingHostRequestCount: 0, upcoming: [] },
      onSetOpenToGreeting: async (open) => {
        window.__greetingValue = open;
      },
      onSetPresenceSharing: async (shared) => {
        window.__sharingValue = shared;
      },
      presenceSettings: { locationStatus: "denied", openToGreeting: true, sharePresence: true },
    });
  });

  const sharing = page.getByTestId("presence-sharing-toggle");
  await expect(sharing).toHaveAttribute("role", "switch");
  await expect(sharing).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("presence-location-status")).toContainText("拒絕");
  await expect(page.locator(".presence-settings")).toContainText("開啟期間你的所在球場對其他有開啟的完整檔案球友可見");
  await page.getByTestId("open-to-greeting-toggle").uncheck();
  await expect.poll(() => page.evaluate(() => window.__greetingValue)).toBe(false);
  await sharing.click();
  await expect.poll(() => page.evaluate(() => window.__sharingValue)).toBe(false);
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions notification settings migrate legacy districts and save Taipei court subscriptions", async ({ page }) => {
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
      courts: [
        { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
        { city: "台北市", district: "中山區", id: 9, name: "第二球場" },
        { city: "台北市", district: "萬華區", id: 10, name: "第三球場" },
      ],
      groups: { history: [], needsAction: [], pendingHostRequestCount: 0, upcoming: [] },
      notificationSettings: {
        courtIds: [],
        districts: ["大安區"],
        prefs: {
          guestInvitedEnabled: true,
          guestRequestReviewedEnabled: true,
          hostNewRequestEnabled: true,
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

  const settings = page.locator(".notification-settings");
  await expect(settings).toContainText("通知設定");
  await expect(settings).toContainText("加入主畫面");
  await expect(settings).not.toContainText("LINE");
  await expect(page.getByTestId("enable-push")).toHaveText("開啟推播");
  await expect(settings).toContainText("你原本訂閱的是行政區；請重新選擇最多 10 座球場");
  await expect(page.locator("[data-notification-district]")).toHaveCount(0);
  const courtSelect = page.getByTestId("notification-court-subscriptions");
  await expect(courtSelect).toBeEnabled();

  await page.getByTestId("enable-push").click();
  await expect.poll(() => page.evaluate(() => window.__enablePushCalls)).toBe(1);

  await page.getByTestId("notification-host-new-request").uncheck();
  await expect.poll(() => page.evaluate(() => window.__savedNotificationPreferences)).toEqual({
    guestInvitedEnabled: true,
    guestRequestReviewedEnabled: true,
    hostNewRequestEnabled: false,
  });

  await courtSelect.selectOption(["8", "10"]);
  await expect.poll(() => page.evaluate(() => window.__savedCourtSubscriptions)).toEqual([8, 10]);
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions notification settings reject an eleventh court before calling the RPC", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await import("/src/sessionViews.js");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    const courts = Array.from({ length: 11 }, (_, index) => ({
      city: "台北市",
      district: `測試區${index + 1}`,
      id: index + 1,
      name: `測試球場${index + 1}`,
    }));
    renderMySessionsPage(root, {
      authenticated: true,
      courts,
      groups: { history: [], needsAction: [], pendingHostRequestCount: 0, upcoming: [] },
      notificationSettings: { courtIds: courts.slice(0, 10).map((court) => court.id) },
      onSaveCourtSubscriptions: async (courtIds) => {
        window.__savedElevenCourts = courtIds;
      },
    });
  });

  const courtSelect = page.getByTestId("notification-court-subscriptions");
  await courtSelect.selectOption(Array.from({ length: 11 }, (_, index) => String(index + 1)));
  await expect(page.locator("[data-notification-error]")).toContainText("最多只能訂閱 10 座球場");
  await expect(courtSelect.locator("option:checked")).toHaveCount(10);
  expect(await page.evaluate(() => window.__savedElevenCourts)).toBeUndefined();
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
  expect(fieldOrder).toEqual(["venue", "court", "time", "details", "host", "notes", "copy-link", "primary"]);
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
  await expect(createSheet).toContainText(
    "選擇直接加入後，已填暱稱且 NTRP 符合球局範圍的球友會直接加入；未填 NTRP 或超出範圍者會改為申請，由你審核。LINE ID 為選填，雙方有提供時才會顯示。"
  );
  const requiredOrder = await form
    .locator("[data-testid='session-court'], [data-testid='session-start-at'], [data-testid='session-play-type'], [data-testid='session-slots-total']")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid")));
  expect(requiredOrder).toEqual(["session-court", "session-start-at", "session-play-type", "session-slots-total"]);

  await form.getByTestId("session-now-start").click();
  await expect(form.getByTestId("session-start-at")).toHaveValue(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);

  await form.getByTestId("session-court").selectOption("8");
  await form.getByTestId("session-start-at").fill("2099-07-18T09:30");
  await form.getByTestId("session-play-type").selectOption("單打");
  await form.getByTestId("session-slots-total").selectOption("1");
  await form.getByTestId("session-submit").click();
  await expect(form.getByRole("alert")).toContainText("本機示範資料僅供瀏覽");
  await expect(createSheet).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions explains a missing LINE ID without rendering a dead copy control", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await import("/src/sessionViews.js");
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
    renderMySessionsPage(root, {
      authenticated: true,
      contactsForSession: () => [
        { counterpartProfileId: 91, lineId: "", nickname: "未填 LINE 球友", sessionId: 739 },
      ],
      groups: { history: [], needsAction: [], pendingHostRequestCount: 0, upcoming: [session] },
    });
  });

  const contact = page.getByTestId("session-contact-91");
  await expect(contact).toContainText("對方尚未提供 LINE ID。");
  await expect(contact.getByLabel("未填 LINE 球友 的 LINE ID")).toHaveCount(0);
  await expect(contact.getByRole("button", { name: "複製 LINE ID" })).toHaveCount(0);
  await expect(contact.getByRole("button", { name: "複製開場訊息" })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("a host request card names an absent NTRP instead of displaying NTRP 0.0", async ({ page }) => {
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
              sessionId: 740,
              startAt: "2099-07-19T01:00:00.000Z",
            },
          },
        ],
        pendingHostRequestCount: 1,
        upcoming: [],
      },
    });
  });

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
    const { openProfileCompletionSheet } = await import("/src/sessionViews.js");
    openProfileCompletionSheet({ intent: { action: "create" }, profile: { courts: new Set(), nick: "", ntrp: null, slots: new Set(), types: new Set() } });
  });
  const createProfile = page.locator("#profile-completion-sheet");
  await expect(createProfile).toContainText("要開球局，請填寫公開暱稱與 NTRP（1.0–7.0）。");
  await expect(createProfile.getByLabel("公開暱稱")).toBeVisible();
  await expect(createProfile.getByLabel(/NTRP 程度/)).toBeVisible();
  await expect(createProfile.getByLabel("LINE ID（選填）")).toHaveCount(0);
  await expect(createProfile.getByLabel("常打球場")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await import("/src/sessionViews.js");
    openProfileCompletionSheet({
      intent: { action: "create" },
      profile: { courts: new Set(), lineId: "", nick: "已有暱稱", ntrp: null, slots: new Set(), types: new Set() },
    });
  });
  const ntrpOnlyProfile = page.locator("#profile-completion-sheet");
  await expect(ntrpOnlyProfile.getByLabel("公開暱稱")).toHaveCount(0);
  await expect(ntrpOnlyProfile.getByLabel(/NTRP 程度/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await import("/src/sessionViews.js");
    openProfileCompletionSheet({ intent: { action: "players" }, profile: { courts: new Set(), nick: "", ntrp: null, slots: new Set(), types: new Set() } });
  });
  await expect(page.locator("#profile-completion-sheet")).toContainText(
    "要使用球友目錄或公開球友卡，請填寫公開暱稱、NTRP（1.0–7.0），並選擇至少一座台北市常打球場。"
  );
  await page.keyboard.press("Escape");
  expect(runtimeErrors).toEqual([]);
});

test("create sheet progressively discloses all three venue types and submits candidate courts as an array", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openCreateSessionSheet } = await import("/src/sessionViews.js");
    window.__stage4bCreatePayload = null;
    openCreateSessionSheet({
      courts: [
        { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
        { city: "台北市", district: "中山區", id: 9, name: "第二球場" },
        { city: "台北市", district: "萬華區", id: 10, name: "第三球場" },
      ],
      onSubmit: async (payload) => {
        window.__stage4bCreatePayload = payload;
      },
    });
  });

  const sheet = page.locator("#session-create-modal");
  const form = sheet.getByTestId("session-form");
  await expect(form.getByTestId("session-venue-booked")).toBeChecked();
  await expect(form.getByTestId("session-court")).toBeVisible();
  await expect(form.getByTestId("session-candidate-courts")).toBeHidden();
  await expect(form.getByTestId("session-range-end")).toBeHidden();

  await form.getByTestId("session-venue-walk-on").check();
  await expect(form.getByTestId("session-court")).toBeVisible();
  await expect(form.getByTestId("session-candidate-courts")).toBeHidden();

  await form.getByTestId("session-venue-candidates").check();
  await expect(form.getByTestId("session-court")).toBeHidden();
  await expect(form.getByTestId("session-candidate-courts")).toBeVisible();
  await expect(form.getByTestId("session-range-end")).toBeVisible();
  await form.getByTestId("session-candidate-courts").selectOption(["8", "9", "10"]);
  await form.getByTestId("session-start-at").fill("2099-07-18T09:30");
  await form.getByTestId("session-range-end").fill("2099-07-18T12:00");
  await form.getByTestId("session-play-type").selectOption("雙打");
  await expect(form.getByTestId("session-slots-total")).toHaveValue("3");
  await form.getByTestId("session-slots-total").selectOption("2");
  await form.getByLabel("費用說明（選填，最多 500 字）").fill("每人 150 元");
  await form.getByTestId("session-submit").click();

  await expect.poll(() => page.evaluate(() => window.__stage4bCreatePayload)).toMatchObject({
    candidateCourtIds: [8, 9, 10],
    courtId: null,
    feeNote: "每人 150 元",
    rangeEnd: "2099-07-18T04:00:00.000Z",
    slotsTotal: 2,
    venueType: "candidates",
  });
  expect(runtimeErrors).toEqual([]);
});

test("an existing one-decimal NTRP can save a nickname-only edit unchanged", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await import("/src/sessionViews.js");
    window.__savedOneDecimalProfile = null;
    openProfileCompletionSheet({
      onSave: async (draft) => {
        window.__savedOneDecimalProfile = { nick: draft.nick, ntrp: draft.ntrp };
        return draft;
      },
      profile: { courts: new Set(), lineId: "", nick: "原暱稱", ntrp: 3.7, slots: new Set(), types: new Set() },
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
  await expect.poll(() => page.evaluate(() => window.__savedOneDecimalProfile)).toEqual({
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
      const { openProfileCompletionSheet } = await import("/src/sessionViews.js");
      window.__profileNtrpResults = window.__profileNtrpResults ?? [];
      openProfileCompletionSheet({
        onSave: async (draft) => {
          window.__profileNtrpResults.push(draft.ntrp);
          return draft;
        },
        profile: { courts: new Set(), lineId: "", nick: "邊界球友", ntrp: nextValue, slots: new Set(), types: new Set() },
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
    const { openProfileCompletionSheet } = await import("/src/sessionViews.js");
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
      profile: { courts: new Set(), lineId: "", nick: "", ntrp: null, slots: new Set(), types: new Set() },
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
  await expect.poll(() => page.evaluate(() => window.__nicknameOnlyProfile)).toEqual({
    courts: [],
    lineId: "",
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

test("a mock profile save preserves existing courts while the catalogue has no options", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await import("/src/sessionViews.js");
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
        lineId: "",
        nick: "保留球場球友",
        ntrp: null,
        slots: new Set(),
        types: new Set(),
      },
    });
  });

  const profile = page.locator("#profile-completion-sheet");
  await expect(profile.getByLabel("常打球場")).toBeDisabled();
  await profile.getByTestId("profile-save").click();
  await expect(profile).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__mockSavedProfileCourts)).toEqual(["既有台北球場"]);
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
    await controller.setAuthState({ user: { id: "mock-player-host" } }, { directory: true, nickname: true, ntrp: true });
    await controller.togglePlayerLayer();
  });

  await expect(page.getByTitle("球友 · 台北網球中心 · 2 位 · 在場 1 人")).toBeVisible();
  await page.getByTitle("球友 · 台北網球中心 · 2 位 · 在場 1 人").click();
  const playerCard = page.getByTestId("court-player-card-8001");
  await expect(playerCard).toContainText("示範山嵐");
  await expect(playerCard).toContainText("在場・2 分鐘前");
  await expect(playerCard).toContainText("接受現場問候");
  await playerCard.click();
  await expect(page.locator("#player-card-sheet")).toContainText("示範山嵐");
  await expect(page.locator("#player-card-sheet")).toContainText("在場・2 分鐘前");
  await expect(page.locator("#player-card-sheet")).toContainText("接受現場問候");
  expect(runtimeErrors).toEqual([]);
});

test("chat sheet escapes user bodies, separates system messages, and becomes archived read-only", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { openSessionChatSheet } = await import("/src/sessionViews.js");
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
        onBlock: (profileId) => window.__chatActions.push(["block", profileId]),
        onPost: (body) => window.__chatActions.push(["post", body]),
        onReport: (messageId) => window.__chatActions.push(["report", messageId]),
      }
    );
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
  await expect(chat.getByText("主揪")).toBeVisible();
  await expect(chat.locator("[data-chat-roster]")).toContainText("示範球友");

  await page.evaluate(() => window.__chatSheet.setState({ messages: [], roster: [], status: "ready" }));
  await expect(chat).toContainText("目前還沒有訊息，從一句招呼開始吧。");
  await page.evaluate(() => window.__chatSheet.setArchived());
  await expect(chat.getByTestId("chat-message-input")).toBeDisabled();
  await expect(chat).toContainText("球局已封存");
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions exposes chat only to accepted members and manages the authoritative block list", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await import("/src/sessionViews.js");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("my-sessions-page").hidden = false;
    const base = {
      canCancel: false,
      canConfirmAttendance: false,
      canConfirmPlayed: false,
      canRespondInvite: false,
      court: "示範球場",
      courtDistrict: "大安區",
      playType: "雙打",
      sessionId: 8201,
      slotsRemaining: 0,
      startAt: "2026-08-04T10:00:00+08:00",
      status: "open",
      viewerRole: "guest",
    };
    window.__myChatActions = [];
    renderMySessionsPage(root, {
      authenticated: true,
      blockedPlayers: [{ blockedNickname: "已封鎖球友 <b>", blockedProfileId: 92, createdAt: "2026-08-03T01:00:00Z" }],
      blockedPlayersStatus: "ready",
      groups: {
        history: [],
        needsAction: [],
        pendingHostRequestCount: 0,
        upcoming: [
          { ...base, canWithdraw: true, viewerParticipantStatus: "accepted" },
          { ...base, canWithdraw: true, sessionId: 8202, viewerParticipantStatus: "requested" },
        ],
      },
      onOpenChat: (sessionId) => window.__myChatActions.push(["chat", sessionId]),
      onUnblockPlayer: (profileId) => window.__myChatActions.push(["unblock", profileId]),
    });
  });

  const root = page.locator("#my-sessions-root");
  await expect(root.getByTestId("open-chat-8201")).toBeVisible();
  await expect(root.getByTestId("open-chat-8202")).toHaveCount(0);
  await expect(root.locator("b")).toHaveCount(0);
  await expect(root.getByText("已封鎖球友 <b>")).toBeVisible();
  await root.getByTestId("open-chat-8201").click();
  await root.getByTestId("unblock-player-92").click();
  await expect.poll(() => page.evaluate(() => window.__myChatActions)).toEqual([
    ["chat", "8201"],
    ["unblock", "92"],
  ]);
});
