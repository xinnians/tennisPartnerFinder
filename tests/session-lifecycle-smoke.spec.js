import {
  expect,
  test,
  readAppTestHook,
  installFakeMaps,
  TAINTED_PUBLIC_VALUES,
  installTaintedMockSessions,
  captureConsoleErrors,
} from "./fixtures/smoke.js";

test("anonymous session artifacts strip tainted source fields from HTML, data attributes, markers, and captured JSON", async ({
  page,
}) => {
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
    const renderedMarkerAttributes = [...document.querySelectorAll(".test-marker")].map((marker) => ({
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
      markerAttributes: renderedMarkerAttributes,
    };
  });

  const capturedJson = JSON.stringify(captured);
  for (const value of TAINTED_PUBLIC_VALUES) expect(capturedJson).not.toContain(value);
  const mockSessionCount = await page.evaluate(
    async () => (await window.__importAppModule("mockData")).MOCK_SESSIONS.length
  );
  expect(mockSessionCount).toBeGreaterThan(0);
  await expect.poll(() => readAppTestHook(page, ["mockData", "sessionTaint", "appliedCount"])).toBe(mockSessionCount);
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

test("the open drawer keeps the map layer hit-testable and its base-court pin clickable", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");
  // qmSheetUp 進場動畫 320ms:滑入中量幾何會拿到中途位置,選出的「未被蓋住」釘
  // 在動畫結束後會被抽屜蓋住(全套件下的間歇紅)。先等動畫收斂再量。
  await page
    .locator("#nearby-sessions-list")
    .evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  await expect(page.locator("#nearby-sessions-backdrop")).toHaveCount(0);
  await expect(page.locator("#map")).toHaveJSProperty("inert", false);

  // Probe a point that is genuinely open map (below the top overlay, above the
  // open drawer) instead of a fixed corner — at narrow widths the overlay sits
  // in normal flow at the top of .map-page, so a naive top-left probe can land
  // on that legitimate overlay control instead of proving anything about the
  // drawer.
  // 批 D2:抽屜面板改為 fixed 定位的 #nearby-sessions-list(aside 容器本身無版面),
  // 幾何量測以面板為準。批 D4a:probe 邊界改用 .map-topbar(含 chips 列與其
  // padding-bottom 的完整 overlay 高度),取代已改為透明可捲動列的 .map-toolbar,
  // 避免探測點落在 overlay 的留白 padding 內。
  const geometry = await page.evaluate(() => {
    const mapRect = document.getElementById("map").getBoundingClientRect();
    const drawerRect = document.getElementById("nearby-sessions-list").getBoundingClientRect();
    const topbarRect = document.querySelector(".map-topbar")?.getBoundingClientRect() ?? null;
    return {
      mapRect: { x: mapRect.x, y: mapRect.y, width: mapRect.width, height: mapRect.height },
      drawerRect: { x: drawerRect.x, y: drawerRect.y, width: drawerRect.width, height: drawerRect.height },
      openAreaTop: topbarRect ? topbarRect.bottom : mapRect.top,
    };
  });
  const probePoint = {
    x: geometry.mapRect.x + geometry.mapRect.width / 2,
    y: (geometry.openAreaTop + geometry.drawerRect.y) / 2,
  };
  // The probe point must sit outside the half drawer's own box, or a hit
  // there would prove nothing about the map layer being reachable.
  const outsideDrawer =
    probePoint.x < geometry.drawerRect.x ||
    probePoint.x > geometry.drawerRect.x + geometry.drawerRect.width ||
    probePoint.y < geometry.drawerRect.y ||
    probePoint.y > geometry.drawerRect.y + geometry.drawerRect.height;
  expect(outsideDrawer).toBe(true);

  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return { insideMap: Boolean(element?.closest("#map")) };
  }, probePoint);
  expect(hit.insideMap).toBe(true);

  // Pick whichever base-court pin is not visually covered by the open drawer —
  // at narrow widths the drawer spans nearly the full width across its band,
  // so a hardcoded pin id could legitimately sit underneath it.
  const basePins = page.getByRole("button", { name: /地圖圖釘 球場/ });
  const basePinCount = await basePins.count();
  let clickablePin = null;
  for (let index = 0; index < basePinCount; index += 1) {
    const candidate = basePins.nth(index);
    const box = await candidate.boundingBox();
    if (!box) continue;
    const overlapsDrawer = !(
      box.x + box.width < geometry.drawerRect.x ||
      box.x > geometry.drawerRect.x + geometry.drawerRect.width ||
      box.y + box.height < geometry.drawerRect.y ||
      box.y > geometry.drawerRect.y + geometry.drawerRect.height
    );
    if (!overlapsDrawer) {
      clickablePin = candidate;
      break;
    }
  }
  // At very narrow viewports the open drawer's own band can cover every
  // currently rendered base-court pin (it spans nearly the full width there).
  // That is ordinary z-order occlusion, not the drawer making the map inert —
  // the elementFromPoint/inert assertions above already cover that claim on
  // every project. Skip only the click-through-to-a-pin verification when no
  // pin is geometrically reachable at this viewport.
  test.skip(!clickablePin, "no base-court pin is clear of the open drawer at this viewport width");
  await clickablePin.click();
  await expect(page.locator("#court-session-sheet")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("open drawer: opening a session detail sheet and closing it restores the drawer and focus to the originating card", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");

  const card = page.locator("[data-testid='session-card']").first();
  await card.focus();
  await card.press("Enter");
  await expect(page.locator("#session-sheet")).toBeVisible();
  // The sheet floats above the persistent drawer — the drawer stays open
  // underneath it (dc:詳情 scrim 蓋在抽屜之上且不關抽屜)。
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");

  await page.keyboard.press("Escape");
  await expect(page.locator("#session-sheet")).toBeHidden();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");
  await expect(card).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("batch 18 quiet discovery refresh preserves drawer scroll after restoring card focus", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.evaluate(async () => {
    const { createSessionController } = await window.__importAppModule("sessionController");
    const { COURTS, MOCK_SESSIONS } = await window.__importAppModule("mockData");
    const { renderNearbySessionsDrawer } = await window.__importAppModule("sessionViews");
    document.getElementById("nearby-sessions-drawer")?.remove();
    const root = document.createElement("aside");
    root.id = "batch-18-drawer";
    document.body.appendChild(root);

    const template = MOCK_SESSIONS.find((session) => session.slotsRemaining > 0);
    const sessions = Array.from({ length: 32 }, (_, index) => ({
      ...template,
      sessionId: 18000 + index,
    }));
    const visibilityTarget = new EventTarget();
    Object.defineProperty(visibilityTarget, "visibilityState", { value: "visible" });
    let discoveryLoads = 0;
    const controller = createSessionController({
      api: {
        loadSessionDiscovery: async () => {
          discoveryLoads += 1;
          return sessions;
        },
      },
      discoveryPollIntervalMs: 1_000_000,
      visibilityTarget,
      render: (view) => renderNearbySessionsDrawer(root, { ...view, courts: COURTS }),
    });
    await controller.loadDiscovery();
    controller.setDrawerState("open");
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const scroll = root.querySelector(".nearby-drawer__scroll");
    const focusedCard = root.querySelectorAll("[data-session-id]")[8];
    focusedCard.focus({ preventScroll: true });
    scroll.scrollTop = 200;
    window.__batch18QuietRefresh = () => visibilityTarget.dispatchEvent(new Event("visibilitychange"));
    window.__batch18DiscoveryLoads = () => discoveryLoads;
  });

  expect(await page.evaluate(() => document.querySelector("#batch-18-drawer .nearby-drawer__scroll").scrollTop)).toBe(
    200
  );
  await page.evaluate(() => window.__batch18QuietRefresh());
  await expect.poll(() => page.evaluate(() => window.__batch18DiscoveryLoads())).toBe(2);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const result = await page.evaluate(() => ({
    focusedSessionId: document.activeElement?.getAttribute("data-session-id"),
    scrollTop: document.querySelector("#batch-18-drawer .nearby-drawer__scroll").scrollTop,
  }));
  expect(result).toEqual({ focusedSessionId: "18008", scrollTop: 200 });
  expect(runtimeErrors).toEqual([]);
});

test("batch 18 drawer scroll memory covers first render, both v2 states, collapsed redraw, and shorter-list clamping", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const firstRender = await page.evaluate(async () => {
    const { COURTS, MOCK_SESSIONS } = await window.__importAppModule("mockData");
    const { renderNearbySessionsDrawer } = await window.__importAppModule("sessionViews");
    document.getElementById("nearby-sessions-drawer")?.remove();
    const root = document.createElement("aside");
    root.id = "batch-18-state-drawer";
    document.body.appendChild(root);
    const template = MOCK_SESSIONS.find((session) => session.slotsRemaining > 0);
    const sessions = Array.from({ length: 32 }, (_, index) => ({
      ...template,
      sessionId: 18100 + index,
    }));
    const render = (drawerState, nextSessions = sessions) =>
      renderNearbySessionsDrawer(root, { courts: COURTS, drawerState, sessions: nextSessions });

    render("collapsed");
    window.__batch18DrawerState = { render, sessions, template };
    return {
      hidden: root.querySelector("#nearby-sessions-list").hidden,
      scrollTop: root.querySelector(".nearby-drawer__scroll").scrollTop,
      state: root.querySelector("#nearby-sessions-list").dataset.drawerState,
    };
  });
  expect(firstRender).toEqual({ hidden: true, scrollTop: 0, state: "collapsed" });

  await page.evaluate(() => {
    const { render } = window.__batch18DrawerState;
    render("open");
    document.querySelector("#batch-18-state-drawer .nearby-drawer__scroll").scrollTop = 200;
    render("collapsed");
    // This second collapsed render is the falsifiable step: a broken
    // implementation would overwrite the remembered 200 with the hidden
    // replacement element's zero before the drawer is reopened.
    render("collapsed");
    render("open");
  });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
  expect(
    await page.evaluate(() => document.querySelector("#batch-18-state-drawer .nearby-drawer__scroll").scrollTop)
  ).toBe(200);

  const clamped = await page.evaluate(async () => {
    const { render, template } = window.__batch18DrawerState;
    render("open", [{ ...template, sessionId: 18999 }]);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const scroll = document.querySelector("#batch-18-state-drawer .nearby-drawer__scroll");
    return { maxScrollTop: Math.max(0, scroll.scrollHeight - scroll.clientHeight), scrollTop: scroll.scrollTop };
  });
  expect(clamped.scrollTop).toBe(clamped.maxScrollTop);
  expect(runtimeErrors).toEqual([]);
});

test("swiping the drawer up moves it one segment at a time, and swiping down reverses it one segment at a time", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  const drawer = page.locator("#nearby-sessions-drawer");
  const list = page.locator("#nearby-sessions-list");
  await expect(list).toHaveAttribute("data-drawer-state", "collapsed");

  // wireDrawerInteractions binds pointerdown/pointerup directly on #nearby-sessions-drawer
  // and re-binds on every render, so each gesture must wait for the previous
  // one's render to land before firing (the 44px threshold is unchanged).
  const swipe = async (delta) => {
    const start = 300;
    await drawer.dispatchEvent("pointerdown", { clientY: start, pointerId: 1 });
    await drawer.dispatchEvent("pointerup", { clientY: start - delta, pointerId: 1 });
  };

  await swipe(100); // up: collapsed -> open
  await expect(list).toHaveAttribute("data-drawer-state", "open");
  await swipe(100); // up again: v2 只有兩態,維持 open
  await expect(list).toHaveAttribute("data-drawer-state", "open");

  await swipe(-100); // down: open -> collapsed
  await expect(list).toHaveAttribute("data-drawer-state", "collapsed");
  await expect(list).toBeHidden();
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

test("clicking the drawer's collapse handle directly collapses the open drawer", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");

  await page.getByTestId("drawer-collapse").click();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "collapsed");
  await expect(page.locator("#nearby-sessions-toggle")).toHaveAttribute("aria-expanded", "false");
  expect(runtimeErrors).toEqual([]);
});

test("Escape closes an open level popover before it reaches the open drawer beneath it", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  await page.locator("#nearby-sessions-toggle").click();
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");

  await page.locator("#level-chip").click();
  await expect(page.locator("#level-popover")).toBeVisible();
  await expect(page.locator("#level-chip")).toHaveAttribute("aria-expanded", "true");

  // First Escape must only close the popover: the drawer beneath it stays open.
  await page.keyboard.press("Escape");
  await expect(page.locator("#level-popover")).toBeHidden();
  await expect(page.locator("#level-chip")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "open");

  // With the popover gone, a second Escape now reaches the drawer and collapses it.
  await page.keyboard.press("Escape");
  await expect(page.locator("#nearby-sessions-list")).toHaveAttribute("data-drawer-state", "collapsed");
  expect(runtimeErrors).toEqual([]);
});

test("a pending join confirmation accepts only one intentional submission", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  // 批 C3-2:join 確認併進同一張 detail sheet,不再開獨立 dialog——直接以
  // initialStage:"confirming" 開 sheet 驗證雙擊只送出一次。
  await page.evaluate(async () => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    let releaseConfirmation;
    window.__joinConfirmationCalls = 0;
    window.__releaseJoinConfirmation = () => releaseConfirmation?.();
    const pendingConfirmation = new Promise((resolve) => {
      releaseConfirmation = resolve;
    });
    openSessionSheet(
      { court: "示範球場", startAt: "2026-07-19T01:00:00.000Z" },
      {
        action: { label: "申請加入", kind: "join", expectedAccepted: false },
        initialStage: "confirming",
        onConfirmJoin: async () => {
          window.__joinConfirmationCalls += 1;
          await pendingConfirmation;
          return { joinSubmitted: true };
        },
      }
    );
  });

  const sheet = page.locator("#session-sheet");
  const confirm = sheet.getByTestId("join-confirm");
  await expect(confirm).toBeVisible();
  await page.evaluate(() => {
    const button = document.querySelector('#session-sheet [data-testid="join-confirm"]');
    button?.click();
    button?.click();
  });
  await expect.poll(() => page.evaluate(() => window.__joinConfirmationCalls)).toBe(1);
  await expect(confirm).toBeDisabled();
  // 批 C3-3(補 Task 2 審查遺留):submitting 態兩鈕皆 disabled,
  // JOIN_STAGE_FOCUSABLE_SELECTOR 排除 disabled 元素找不到目標,焦點 fallback 回
  // 帶 tabindex="-1" 的動作區容器本身(同一個節點也帶 data-join-stage),不落 body。
  await expect(sheet.locator('[data-join-stage="submitting"]')).toBeFocused();
  await page.evaluate(() => window.__releaseJoinConfirmation());
  await expect(sheet.getByTestId("join-success-title")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("withdrawal requires an in-project confirmation that warns the member cannot apply again", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openWithdrawSessionConfirmation } = await window.__importAppModule("sessionViews");
    let releaseWithdrawal;
    window.__withdrawConfirmationCalls = 0;
    window.__releaseWithdrawal = () => releaseWithdrawal?.();
    const pendingWithdrawal = new Promise((resolve) => {
      releaseWithdrawal = resolve;
    });
    openWithdrawSessionConfirmation({
      onConfirm: async () => {
        window.__withdrawConfirmationCalls += 1;
        await pendingWithdrawal;
      },
    });
  });

  const confirmation = page.getByRole("dialog", { name: "確認退出這一局？" });
  await expect(confirmation).toContainText("退出後將無法再次申請這一局。");
  const confirm = confirmation.getByRole("button", { name: "確認退出" });
  await page.evaluate(() => {
    const button = document.querySelector("[data-confirm-withdraw]");
    button?.click();
    button?.click();
  });
  await expect.poll(() => page.evaluate(() => window.__withdrawConfirmationCalls)).toBe(1);
  await expect(confirm).toBeDisabled();
  await page.evaluate(() => window.__releaseWithdrawal());
  await expect(confirmation).toBeHidden();
  expect(runtimeErrors).toEqual([]);
});

test("cancelling chat withdrawal keeps the action enabled and allows reopening confirmation", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openSessionChatSheet, openWithdrawSessionConfirmation } = await window.__importAppModule("sessionViews");
    window.__chatWithdrawConfirmationCount = 0;
    openSessionChatSheet(
      {
        court: "示範球場",
        courtDistrict: "大安區",
        playType: "雙打",
        sessionId: 8102,
        slotsRemaining: 0,
        startAt: "2026-08-03T10:00:00+08:00",
        status: "open",
      },
      {
        canWithdraw: true,
        onWithdraw: () => {
          window.__chatWithdrawConfirmationCount += 1;
          return openWithdrawSessionConfirmation();
        },
      }
    );
  });

  const chat = page.getByTestId("session-chat-sheet");
  const withdraw = chat.getByRole("button", { name: "取消參加" });
  await withdraw.click();
  const confirmation = page.getByRole("dialog", { name: "確認退出這一局？" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "先不要" }).click();
  await expect(confirmation).toBeHidden();
  await expect(withdraw).toBeEnabled();
  await withdraw.click();
  await expect(confirmation).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__chatWithdrawConfirmationCount)).toBe(2);
  expect(runtimeErrors).toEqual([]);
});

test("cancelling My Sessions withdrawal keeps the action enabled and allows reopening confirmation", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openWithdrawSessionConfirmation, renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    window.__mySessionWithdrawConfirmationCount = 0;
    renderMySessionsPage(root, {
      authenticated: true,
      groups: {
        history: [],
        needsAction: [],
        needsActionCount: 0,
        upcoming: [
          {
            canWithdraw: true,
            court: "青年公園網球場",
            courtDistrict: "萬華區",
            hostNickname: "主揪",
            playType: "雙打",
            sessionId: 8103,
            slotsRemaining: 0,
            startAt: "2099-08-03T10:00:00+08:00",
            status: "open",
            viewerParticipantStatus: "accepted",
            viewerRole: "guest",
          },
        ],
      },
      onWithdraw: () => {
        window.__mySessionWithdrawConfirmationCount += 1;
        return openWithdrawSessionConfirmation();
      },
    });
  });

  const withdraw = page.locator("[data-my-action='withdraw'][data-session-id='8103']");
  await withdraw.click();
  const confirmation = page.getByRole("dialog", { name: "確認退出這一局？" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "先不要" }).click();
  await expect(confirmation).toBeHidden();
  await expect(withdraw).toBeEnabled();
  await withdraw.click();
  await expect(confirmation).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__mySessionWithdrawConfirmationCount)).toBe(2);
  expect(runtimeErrors).toEqual([]);
});

test("join confirmation shares the sheet's own summary (no repeat) and becomes an in-place success state", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  // 批 C3-2:join 確認併進同一張 detail sheet,不再重複渲染球局摘要——detail 上方
  // 欄位只出現一次,confirming 態只加差異提示(join 型式)。
  await page.evaluate(async () => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    openSessionSheet(
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
        sessionId: 9402,
        slotsRemaining: 1,
        startAt: "2026-07-19T01:00:00.000Z",
      },
      {
        action: { label: "申請加入", kind: "join", expectedAccepted: false },
        initialStage: "confirming",
        onConfirmJoin: async () => ({ joinSubmitted: true }),
        // 批 C3-3:CTA 現在把 session.sessionId 交回呼叫端(main.js 用它聚焦 My
        // Sessions 新參與卡),這裡記錄實際收到的參數值,不只是呼叫次數。
        onViewMySessions: (sessionId) => {
          window.__joinSuccessDestinationCalls = (window.__joinSuccessDestinationCalls ?? 0) + 1;
          window.__joinSuccessDestinationArgs = (window.__joinSuccessDestinationArgs ?? []).concat([sessionId]);
        },
      }
    );
  });

  const sheet = page.locator("#session-sheet");
  await expect(sheet.locator('[data-join-stage="confirming"]')).toBeVisible();
  await expect(sheet.getByTestId("join-confirm")).toBeVisible();
  await expect(sheet.getByTestId("join-cancel")).toBeVisible();
  // 摘要只在 detail 本體出現一次,confirming 不重複渲染。
  // 批 D4b:v2 頭部把球場名(19px)與行政區・時間拆成兩行、記分板條拆成三格
  // 獨立 cell,原本用 " · " 串接的單一長字串斷成分項比對。
  await expect(sheet.locator(".session-detail__court")).toHaveText("青年公園網球場");
  await expect(sheet.locator('[data-session-field="time"]')).toContainText("萬華區");
  await expect(sheet.locator('[data-session-field="details"]')).toContainText("單打");
  // 批 D9 backlog #1:記分板格眉已是「NTRP」,格值改剝掉重複前綴(390px 下原本
  // 折兩行),只在這一格斷言裸範圍;ntrpRange() 本體與其他呼叫點(如下方 host-row
  // 的 formatNtrp())文案不動。用 :has() 鎖定 NTRP 那一格的 value(而不是對整個
  // details 容器 not.toContainText("NTRP 3.0"))——details 容器裡格眉本來就會印出
  // 字面「NTRP」,跟後面的格值文字節點相鄰,Playwright 正規化空白後兩者仍會被
  // 串成「NTRP 3.0…」,對容器整體斷言「不含」永遠假紅,量測目標必須精確到格值本身。
  const ntrpCellValue = sheet
    .locator(".scoreboard-strip__cell", { has: page.locator(".scoreboard-strip__eyebrow", { hasText: "NTRP" }) })
    .locator(".scoreboard-strip__value");
  await expect(ntrpCellValue).toHaveText("3.0–4.0");
  await expect(sheet.locator(".scoreboard-strip__cell--inverse")).toContainText("1 位");
  await expect(sheet.locator(".host-row")).toContainText("公開主揪");
  await expect(sheet.locator(".host-row__chip")).toHaveText("主揪");
  await expect(sheet.locator(".host-row__ntrp")).toHaveText("NTRP 3.5 · 資料完整");
  await expect(sheet).toContainText("自備新球");
  await expect(sheet.locator('[data-session-field="court"]')).toHaveCount(1);
  await sheet.getByTestId("join-confirm").click();
  await expect(sheet.locator('[data-join-stage="success"]')).toBeVisible();
  await expect(sheet.getByTestId("join-cancel")).toHaveCount(0);
  await expect(sheet).toContainText("已送出申請，等待主揪回覆。");
  const successTitle = sheet.getByTestId("join-success-title");
  await expect(successTitle).toBeFocused();
  const mySessionsCta = sheet.getByTestId("join-open-my-sessions");
  await mySessionsCta.click();
  await expect(sheet).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__joinSuccessDestinationCalls)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__joinSuccessDestinationArgs)).toEqual([9402]);
  expect(runtimeErrors).toEqual([]);
});

test("an accepted joined session focuses its own upcoming card without the create-session copy", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  // 批 C3-3:createdSessionId 拆參——highlightSessionId 純做卡片聚焦比對(create／
  // join 兩種來源都可傳),createdSessionId 只在真正的 create 流程才傳,才會觸發
  // 「球局已建立」文案與 create 專屬推播 prompt。這裡模擬 main.js 的 join CTA 接線
  // (reason:"joined" → 只傳 highlightSessionId,不傳 createdSessionId)。
  const acceptedSession = {
    court: "青年公園網球場",
    courtDistrict: "萬華區",
    hostNickname: "主揪",
    playType: "雙打",
    sessionId: 9501,
    slotsRemaining: 0,
    startAt: "2099-08-03T10:00:00+08:00",
    status: "open",
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  };

  await page.evaluate(async (session) => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    renderMySessionsPage(document.getElementById("my-sessions-root"), {
      authenticated: true,
      groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [session] },
      highlightSessionId: session.sessionId,
    });
  }, acceptedSession);

  const root = page.locator("#my-sessions-root");
  await expect(root).not.toContainText("球局已建立");
  await expect(root).toContainText("依目前需要處理的事項與球局時間排序。");
  await expect(root.getByTestId("created-session-enable-push")).toHaveCount(0);
  const openButton = page.locator(
    `#my-upcoming-sessions [data-open-my-session][data-session-id='${acceptedSession.sessionId}']`
  );
  await expect(openButton).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("a pending guest request focuses its own withdraw button, not the page heading, without the create-session copy", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  // 批 C3-3 意外(不在 ground truth 內,實作時發現):approval／NTRP 缺／NTRP 範圍外
  // 三種 outcome 送出後,session 落在 needsAction 的 guest-request(不是 upcoming),
  // 舊聚焦骨架只查 upcoming——若不擴充,這三種 outcome 點 CTA 後焦點會直接掉回
  // body。guestRequestCard 現在也接受 highlightSessionId,聚焦其唯一的可操作元素
  // (撤回申請鈕)。
  const pendingSession = {
    court: "大安運動中心",
    courtDistrict: "大安區",
    hostNickname: "主揪",
    playType: "單打",
    sessionId: 9502,
    startAt: "2099-08-03T10:00:00+08:00",
    status: "open",
  };

  await page.evaluate(async (session) => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    renderMySessionsPage(document.getElementById("my-sessions-root"), {
      authenticated: true,
      groups: {
        history: [],
        needsAction: [{ kind: "guest-request", session }],
        needsActionCount: 1,
        upcoming: [],
      },
      highlightSessionId: session.sessionId,
    });
  }, pendingSession);

  const root = page.locator("#my-sessions-root");
  await expect(root).not.toContainText("球局已建立");
  await expect(page.locator("#my-sessions-root [data-my-sessions-heading]")).not.toBeFocused();
  const withdrawButton = page.locator(
    `[data-guest-request-session='${pendingSession.sessionId}'] [data-my-action='withdraw']`
  );
  await expect(withdrawButton).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("join and create success moments offer push only when the device can enable it", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  const session = {
    court: "青年公園網球場",
    courtDistrict: "萬華區",
    hostNickname: "公開主揪",
    hostNtrp: 3.5,
    hostProfileComplete: true,
    ntrpMax: 4,
    ntrpMin: 3,
    playType: "單打",
    sessionId: 8811,
    slotsRemaining: 1,
    startAt: "2099-07-19T01:00:00.000Z",
    status: "open",
    viewerParticipantStatus: "accepted",
    viewerRole: "host",
  };

  // 批 C3-2:join 成功卡併進同一張 detail sheet,不再開獨立 dialog——直接以
  // initialStage:"confirming" 開 sheet,點 join-confirm 進成功態。
  await page.evaluate(async (sessionInput) => {
    const { openSessionSheet, renderMySessionsPage } = await window.__importAppModule("sessionViews");
    window.__successPushCalls = [];
    openSessionSheet(sessionInput, {
      action: { label: "申請加入", kind: "join", expectedAccepted: false },
      initialStage: "confirming",
      notificationSettings: { pushStatus: "idle", webPushConfigured: true },
      onConfirmJoin: async () => ({ joinSubmitted: true }),
      onEnablePush: async () => {
        window.__successPushCalls.push("join");
        return "enabled";
      },
    });
    window.__renderCreatedPush = (settings) => {
      document.getElementById("my-sessions-page").hidden = false;
      renderMySessionsPage(document.getElementById("my-sessions-root"), {
        authenticated: true,
        createdSessionId: sessionInput.sessionId,
        groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [sessionInput] },
        notificationSettings: settings,
        onEnablePush: async () => {
          window.__successPushCalls.push("create");
          return "enabled";
        },
      });
    };
  }, session);

  const confirmation = page.locator("#session-sheet");
  await confirmation.getByTestId("join-confirm").click();
  const joinPush = confirmation.getByTestId("join-success-enable-push");
  await expect(joinPush).toBeVisible();
  await expect(confirmation).toContainText("加入主畫面");
  await joinPush.click();
  await expect(joinPush).toBeHidden();
  await page.keyboard.press("Escape");

  await page.evaluate(() => window.__renderCreatedPush({ pushStatus: "idle", webPushConfigured: true }));
  await expect(page.getByTestId("created-session-enable-push")).toBeVisible();
  await page.getByTestId("created-session-enable-push").click();
  await expect.poll(() => page.evaluate(() => window.__successPushCalls)).toEqual(["join", "create"]);

  for (const settings of [
    { pushStatus: "enabled", webPushConfigured: true },
    { pushStatus: "unsupported", webPushConfigured: true },
    { pushStatus: "idle", webPushConfigured: false },
  ]) {
    await page.evaluate((nextSettings) => window.__renderCreatedPush(nextSettings), settings);
    await expect(page.getByTestId("created-session-enable-push")).toHaveCount(0);
  }

  await page.keyboard.press("Escape");
  for (const settings of [
    { pushStatus: "enabled", webPushConfigured: true },
    { pushStatus: "unsupported", webPushConfigured: true },
  ]) {
    await page.evaluate(
      async ({ sessionInput, settings: nextSettings }) => {
        const { openSessionSheet } = await window.__importAppModule("sessionViews");
        openSessionSheet(sessionInput, {
          action: { label: "申請加入", kind: "join", expectedAccepted: false },
          initialStage: "confirming",
          notificationSettings: nextSettings,
          onConfirmJoin: async () => ({ joinSubmitted: true }),
        });
      },
      { sessionInput: session, settings }
    );
    const nextConfirmation = page.locator("#session-sheet");
    await nextConfirmation.getByTestId("join-confirm").click();
    await expect(nextConfirmation.getByTestId("join-success-enable-push")).toHaveCount(0);
    await page.keyboard.press("Escape");
  }

  await page.evaluate(async (sessionInput) => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    openSessionSheet(sessionInput, {
      action: { label: "申請加入", kind: "join", expectedAccepted: false },
      initialStage: "confirming",
      notificationSettings: { pushStatus: "idle", webPushConfigured: true },
      onConfirmJoin: async () => ({ joinSubmitted: true }),
      onEnablePush: async () => "unsupported",
    });
  }, session);
  const unsupportedConfirmation = page.locator("#session-sheet");
  await unsupportedConfirmation.getByTestId("join-confirm").click();
  const unsupportedPush = unsupportedConfirmation.getByTestId("join-success-enable-push");
  await unsupportedPush.click();
  await expect(unsupportedPush).toBeDisabled();
  await expect(unsupportedConfirmation).toContainText("此瀏覽器不支援 Web Push");
  expect(runtimeErrors).toEqual([]);
});

test("authenticated pre-join roster renders host first with escaped names, NTRP fallback, and avatar fallback", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  // 批 C3-2:join preview 只在 detail sheet 出現一次(idle 態就已 hydrate,
  // confirming 沿用同一份),不再有獨立 confirmation surface 各自渲染一次。
  await page.evaluate(async () => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
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
      {
        avatarUrl: "",
        hostedPlayedCount: 0,
        nickname: "<img src=x onerror=alert(1)>",
        ntrp: null,
        role: "guest",
        sessionId: 881,
      },
      {
        avatarUrl: "https://lh3.googleusercontent.com/a/stage-t45-host",
        hostedPlayedCount: 3,
        nickname: "名單主揪",
        ntrp: 3.5,
        role: "host",
        sessionId: 881,
      },
    ];
    const detail = openSessionSheet(session, { action: { label: "申請加入" }, showJoinPreview: true });
    detail.setJoinPreview({ participants, status: "ready" });
  });

  const preview = page.locator("#session-sheet [data-session-join-preview]");
  await expect(preview).toContainText("已確認參加者");
  await expect(preview.locator("[data-join-preview-person]").first()).toContainText("主揪");
  await expect(preview.locator("[data-join-preview-person]").nth(1)).toContainText("尚未填寫 NTRP");
  await expect(preview).toContainText("<img src=x onerror=alert(1)>");
  await expect(preview.locator("img[src='x']")).toHaveCount(0);
  // 中性聚合數:主揪的 3 顯示、guest 的 0 整行不畫,所以整份名單只有一個 .trust-count。
  await expect(preview.locator(".trust-count")).toHaveCount(1);
  // D5:替代字母只是裝飾,暱稱就在旁邊;與 alt="" 的 img 一致不重複朗讀。
  await expect(preview.locator("[data-avatar-fallback]").first()).toHaveAttribute("aria-hidden", "true");
  await expect(preview.locator("[data-join-preview-person]").first().locator(".trust-count")).toHaveText("已成局 3 次");

  const hostImage = preview.locator("[data-join-preview-person]").first().locator("img");
  await expect(hostImage).toHaveAttribute("src", "https://lh3.googleusercontent.com/a/stage-t45-host");
  await hostImage.dispatchEvent("error");
  await expect(preview.locator("[data-join-preview-person]").first().locator("[data-avatar-fallback]")).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});

test("profile completion previews the current Google avatar and explains that it cannot be customized", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { openProfileCompletionSheet } = await window.__importAppModule("sessionViews");
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

test("an expected instant outcome explains group chat and shows accepted success", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  // 批 C3-2:instant join 也走兩段確認(spec 假設 4),同一張 detail sheet 內嵌
  // confirming/success,不再開獨立的「直接加入這場球局？」dialog。
  await page.evaluate(async () => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    openSessionSheet(
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
        sessionId: 9403,
        slotsRemaining: 2,
        startAt: "2026-07-19T01:00:00.000Z",
      },
      {
        action: { label: "直接加入", kind: "join", expectedAccepted: true },
        initialStage: "confirming",
        onConfirmJoin: async () => ({ accepted: true, joinSubmitted: true }),
        onViewMySessions: () => {
          window.__instantJoinSuccessDestinationCalls = (window.__instantJoinSuccessDestinationCalls ?? 0) + 1;
        },
      }
    );
  });

  const confirmation = page.locator("#session-sheet");
  await expect(confirmation).toContainText("加入後即可在球局群組聊天協調細節。");
  await confirmation.getByTestId("join-confirm").click();
  await expect(confirmation).toContainText("已加入球局！前往我的球局開啟群組聊天。");
  const successTitle = confirmation.getByTestId("join-success-title");
  await expect(successTitle).toBeFocused();
  const mySessionsCta = confirmation.getByTestId("join-open-my-sessions");
  await mySessionsCta.click();
  await expect(confirmation).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__instantJoinSuccessDestinationCalls)).toBe(1);
  expect(runtimeErrors).toEqual([]);
});

test("a host viewing their own accepted session sees no withdraw affordance, unlike an accepted guest", async ({
  page,
}) => {
  // fix round 1(驗收回歸):actionFor 的 kind:"chat" 分支同時涵蓋主揪(host)與
  // accepted guest——兩者的 viewerParticipantStatus 都是 accepted。但
  // can_withdraw / withdraw_from_session 是 guest-only
  // (202607210002_session_join_mode.sql),主揪按「取消報名」會被 RPC 拒絕;改版前
  // 主揪在詳情 sheet 本來就沒有 withdraw 入口。這裡用同一個 session/action 對照
  // isMine true/false 兩種視角:host 視角兩者都不存在,guest 視角兩者都存在
  // ——對稱 control group,證明「不存在」的斷言不是空集合掃描。
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  const session = {
    court: "青年公園網球場",
    courtDistrict: "萬華區",
    hostNickname: "示範松果",
    hostNtrp: 3.5,
    hostProfileComplete: true,
    joinMode: "approval",
    notes: "",
    ntrpMax: 4,
    ntrpMin: 3,
    playType: "單打",
    sessionId: 9601,
    slotsRemaining: 1,
    startAt: "2099-07-19T01:00:00.000Z",
  };

  await page.evaluate(async (sessionInput) => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    openSessionSheet(sessionInput, { action: { label: "群組聊天", kind: "chat" }, isMine: true });
  }, session);
  const hostSheet = page.locator("#session-sheet");
  await expect(hostSheet.getByRole("button", { name: "群組聊天" })).toBeVisible();
  await expect(hostSheet.getByText("已加入這場球局")).toHaveCount(0);
  await expect(hostSheet.getByRole("button", { name: "取消報名" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.evaluate(async (sessionInput) => {
    const { openSessionSheet } = await window.__importAppModule("sessionViews");
    openSessionSheet(sessionInput, { action: { label: "群組聊天", kind: "chat" }, isMine: false });
  }, session);
  const guestSheet = page.locator("#session-sheet");
  await expect(guestSheet.getByRole("button", { name: "群組聊天" })).toBeVisible();
  await expect(guestSheet.getByText("已加入這場球局")).toBeVisible();
  await expect(guestSheet.getByRole("button", { name: "取消報名" })).toBeVisible();

  expect(runtimeErrors).toEqual([]);
});

test("join confirmation distinguishes both requested NTRP outcomes without losing success focus", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");

  for (const [outcome, message] of [
    ["OK_NTRP_MISSING", "已送出申請；你尚未填寫 NTRP，等待主揪回覆。"],
    ["OK_NTRP_OUT_OF_RANGE", "已送出申請；你的 NTRP 不在球局設定範圍內，等待主揪回覆。"],
  ]) {
    await page.evaluate(async (nextOutcome) => {
      const { openSessionSheet } = await window.__importAppModule("sessionViews");
      openSessionSheet(
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
          sessionId: 9404,
          slotsRemaining: 1,
          startAt: "2099-07-19T01:00:00.000Z",
        },
        {
          action: { label: "申請加入", kind: "join", expectedAccepted: false },
          initialStage: "confirming",
          onConfirmJoin: async () => ({ accepted: false, joinSubmitted: true, outcome: nextOutcome }),
        }
      );
    }, outcome);

    const confirmation = page.locator("#session-sheet");
    await expect(confirmation.getByTestId("join-confirm")).toBeVisible();
    await expect(confirmation.getByTestId("join-cancel")).toBeVisible();
    await confirmation.getByTestId("join-confirm").click();
    await expect(confirmation.getByText(message)).toBeVisible();
    await expect(confirmation.getByTestId("join-success-title")).toBeFocused();
    await page.keyboard.press("Escape");
  }
  expect(runtimeErrors).toEqual([]);
});

test("candidate session cards and details resolve every court until Boolean decidedAt becomes true", async ({
  page,
}) => {
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
      const { openSessionSheet, renderNearbySessionsDrawer } = await window.__importAppModule("sessionViews");
      renderNearbySessionsDrawer(document.getElementById("nearby-sessions-drawer"), {
        courts: catalogue,
        drawerState: "open",
        sessions: [session],
      });
      openSessionSheet(session, { action: { label: "申請加入" }, courts: catalogue });
    },
    { candidateSession, courts }
  );

  const card = page.getByTestId("session-card");
  const detail = page.locator("#session-sheet");
  // 批 D2:v2 卡片以「首館 等 N 館候選」表達候選場次(dc L846),完整候選清單只在詳情。
  await expect(card).toContainText("示範球場 等 3 館候選");
  await expect(card).toContainText("每人 150 元");
  await expect(card).not.toContainText("已定案");
  await expect(detail).toContainText("候選局");
  await expect(detail).toContainText("示範球場、第二球場、第三球場");
  await expect(detail).toContainText("每人 150 元");
  await expect(detail).not.toContainText("已定案");
  await page.keyboard.press("Escape");

  await page.evaluate(
    async ({ candidateSession: session, courts: catalogue }) => {
      const { openSessionSheet } = await window.__importAppModule("sessionViews");
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
  // 批 D4b:v2 頭部把球場名與行政區拆成兩行,不再是同一個 " · " 字串。
  await expect(decided).toContainText("第三球場");
  await expect(decided).toContainText("萬華區");
  await expect(decided).toContainText("已定案");
  await expect(decided).not.toContainText("第二球場");
  expect(runtimeErrors).toEqual([]);
});

test("undecided candidate sessions keep their court list and time range across private surfaces", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  const candidateSession = {
    canWithdraw: true,
    candidateCourtIds: [8, 9, 10],
    court: "示範球場",
    courtDistrict: "大安區",
    decidedAt: null,
    hostNickname: "公開主揪",
    hostNtrp: 3.5,
    hostProfileComplete: true,
    ntrpMax: 4,
    ntrpMin: 3,
    notes: "候選局測試",
    playType: "雙打",
    rangeEnd: "2099-07-19T05:00:00.000Z",
    sessionId: 8802,
    slotsRemaining: 2,
    startAt: "2099-07-19T01:00:00.000Z",
    status: "open",
    venueType: "candidates",
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  };
  const courts = [
    { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
    { city: "台北市", district: "中山區", id: 9, name: "第二球場" },
    { city: "台北市", district: "萬華區", id: 10, name: "第三球場" },
  ];
  await page.evaluate(
    async ({ candidateSession: session, courts: catalogue }) => {
      const { openSessionChatSheet, renderMySessionsPage } = await window.__importAppModule("sessionViews");
      const root = document.getElementById("my-sessions-root");
      document.getElementById("tab-map").hidden = true;
      document.getElementById("my-sessions-page").hidden = false;
      renderMySessionsPage(root, {
        authenticated: true,
        courts: catalogue,
        groups: {
          history: [],
          needsAction: [
            {
              kind: "host-request",
              participant: {
                nickname: "申請球友",
                participantId: 201,
                profileId: 301,
                role: "guest",
                status: "requested",
              },
              session,
            },
            { kind: "invite", session },
            { kind: "guest-request", session },
          ],
          needsActionCount: 3,
          upcoming: [session],
        },
      });
      openSessionChatSheet(session, { courts: catalogue });
    },
    { candidateSession, courts }
  );

  // 批 D6:My Sessions 薄卡列改用跟地圖抽屜卡(sessionCard)同一套候選局縮寫
  // 「首館 等 N 館候選」+時間磚小時範圍(dc §3 逐字),不再是「完整候選清單 ·
  // 至 HH:MM」的長字串——那個格式只留在不受本批影響的詳情/聊天 sheet。
  // needsAction 的 host-request 卡只在「我主揪的」分頁,其餘三個(upcoming/
  // invite-row/guest-request)在預設的「我報名的」分頁,故先驗後者、再切分頁驗前者。
  const joinedSurfaces = [
    page.locator("#my-upcoming-sessions .my-session-card"),
    page.getByTestId("invite-row"),
    page.locator("[data-guest-request-session='8802']"),
  ];
  for (const surface of joinedSurfaces) {
    const text = await surface.innerText();
    expect.soft(text).toContain("示範球場 等 3 館候選");
    expect.soft(text).not.toContain("第二球場");
    expect.soft(text).toContain("9–13");
  }

  const chatText = await page.locator("#session-chat-sheet [aria-label='球局資訊']").innerText();
  expect.soft(chatText).toContain("候選局");
  expect.soft(chatText).toContain("示範球場、第二球場、第三球場");
  expect.soft(chatText).toContain("至");
  expect.soft(chatText).toContain("13:00");
  // fix round 1(實測):chat sheet 是 modal(aria-modal + backdrop),沒關掉之前點
  // segmented 分頁鈕會被 backdrop 攔截(locator.click 30s timeout,error context
  // 指名 #session-chat-sheet/.surface-backdrop intercepts pointer events)——關掉
  // 之後才切分頁去驗 hosted-only 的 participant-row。
  await page.keyboard.press("Escape");
  await page.getByTestId("my-sessions-seg-hosted").click();
  const hostedText = await page.getByTestId("participant-row").innerText();
  expect.soft(hostedText).toContain("示範球場 等 3 館候選");
  expect.soft(hostedText).not.toContain("第二球場");
  expect.soft(hostedText).toContain("9–13");

  // 批 C3-2:候選局說明文字只在 detail 本體(不受 join 狀態機影響的區塊)出現一次,
  // 不再有獨立 confirmation surface 各自渲染一份。
  await page.evaluate(
    async ({ candidateSession: session, courts: catalogue }) => {
      const { openSessionSheet } = await window.__importAppModule("sessionViews");
      openSessionSheet(session, { action: { label: "申請加入" }, courts: catalogue });
    },
    { candidateSession, courts }
  );
  // 批 D9 backlog #2:未定案候選局的詳情頭部球場名改用跟 D2 卡片同款
  // sessionCourtLabel()「首館 等 N 館候選」縮寫,不再重複下方候選資訊列的完整清單。
  await expect(page.locator("#session-sheet .session-detail__court")).toHaveText("示範球場 等 3 館候選");
  // 批 D4b:候選資訊列文案改採 dc 版本(「候選球場:X、Y · 主揪定案後群組通知」),
  // 取代退役的 candidateDecisionExplanation()。
  await expect(page.locator("#session-sheet [data-session-candidate-explanation]")).toContainText(
    "候選球場:示範球場、第二球場、第三球場 · 主揪定案後群組通知"
  );
  await page.keyboard.press("Escape");
  await page.evaluate(
    async ({ candidateSession: session, courts: catalogue }) => {
      const { openPlayerCardSheet } = await window.__importAppModule("sessionViews");
      openPlayerCardSheet(
        {
          courtDistrict: "中山區",
          courtName: "第二球場",
          isSelf: false,
          nickname: "可邀請球友",
          ntrp: 3.5,
          profileId: 991,
        },
        { courts: catalogue, myInvitableSessions: [session] }
      );
    },
    { candidateSession, courts }
  );
  await expect(page.locator("#player-card-sheet [data-player-invite-options]")).toContainText("第二球場");
  await expect(page.locator("#player-card-sheet [data-player-invite-options]")).toContainText("至");
  expect(runtimeErrors).toEqual([]);
});

test("decided candidate sessions stay collapsed to one authoritative court and time on private surfaces", async ({
  page,
}) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  const decidedSession = {
    candidateCourtIds: [8, 9, 10],
    court: "第三球場",
    courtDistrict: "萬華區",
    decidedAt: "2099-07-18T08:00:00.000Z",
    hostNickname: "公開主揪",
    hostNtrp: 3.5,
    hostProfileComplete: true,
    ntrpMax: 4,
    ntrpMin: 3,
    playType: "雙打",
    rangeEnd: "2099-07-19T05:00:00.000Z",
    sessionId: 8803,
    slotsRemaining: 2,
    startAt: "2099-07-19T03:00:00.000Z",
    status: "open",
    venueType: "candidates",
    viewerParticipantStatus: "accepted",
    viewerRole: "guest",
  };
  const courts = [
    { city: "台北市", district: "大安區", id: 8, name: "示範球場" },
    { city: "台北市", district: "中山區", id: 9, name: "第二球場" },
    { city: "台北市", district: "萬華區", id: 10, name: "第三球場" },
  ];
  await page.evaluate(
    async ({ decidedSession: session, courts: catalogue }) => {
      const { openSessionChatSheet, renderMySessionsPage } = await window.__importAppModule("sessionViews");
      const root = document.getElementById("my-sessions-root");
      document.getElementById("tab-map").hidden = true;
      document.getElementById("my-sessions-page").hidden = false;
      renderMySessionsPage(root, {
        authenticated: true,
        courts: catalogue,
        groups: {
          history: [],
          needsAction: [{ kind: "invite", session }],
          needsActionCount: 1,
          upcoming: [session],
        },
      });
      openSessionChatSheet(session, { courts: catalogue });
    },
    { decidedSession, courts }
  );

  // 批 D6:My Sessions 薄卡列的球場名沿用 sessionCourtLabel(session?.court 優先於
  // venue.court),已定案候選局因此只顯示球場名、不附行政區,也不掛「候選局 ·
  // 已定案」badge——那些欄位（venue.badge/行政區）只留在不受本批影響的詳情/
  // 聊天 sheet(仍用完整 venue.court)。兩者都在預設的「我報名的」分頁,不需切分頁。
  const decidedSurfaces = [page.locator("#my-upcoming-sessions .my-session-card"), page.getByTestId("invite-row")];
  for (const surface of decidedSurfaces) {
    const text = await surface.innerText();
    expect.soft(text).toContain("第三球場");
    expect.soft(text).toContain("11:00");
    expect.soft(text).not.toContain("第二球場");
    expect.soft(text).not.toContain("至");
    expect.soft(text).not.toContain("已定案");
  }

  const chatText = await page.locator("#session-chat-sheet [aria-label='球局資訊']").innerText();
  expect.soft(chatText).toContain("候選局 · 已定案");
  expect.soft(chatText).toContain("第三球場 · 萬華區");
  expect.soft(chatText).toContain("11:00");
  expect.soft(chatText).not.toContain("第二球場");
  expect.soft(chatText).not.toContain("至");
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions preserves the initiating action and its error across a private-page rerender", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
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
        groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [session] },
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

  // 批 D6:viewerRole host 的 upcoming 卡只在「我主揪的」分頁,預設分頁是「我報名的」。
  await page.getByTestId("my-sessions-seg-hosted").click();
  const cancel = page.locator("[data-my-action='cancel']");
  await cancel.click();
  await expect.poll(() => page.evaluate(() => window.__mySessionActionCalls)).toBe(1);
  await page.evaluate(() => window.__rerenderMySessions());
  await expect(cancel).toBeDisabled();
  await page.evaluate(() => window.__releaseMySessionAction());
  await expect(page.locator("#my-sessions-root [data-my-sessions-error]")).toContainText("球局狀態暫時無法重新載入");
  await expect(cancel).toBeEnabled();
  await expect(cancel).toBeFocused();
  expect(runtimeErrors).toEqual([]);
});

test("My Sessions renders an escaped invite card with stable response testids", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    // eslint-disable-next-line no-useless-escape -- 既有 JS lint 債；本批只擴大守門範圍，不改執行語意。
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
      groups: { history: [], needsAction: [{ kind: "invite", session }], needsActionCount: 1, upcoming: [] },
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

test("invite response buttons dispatch, stay pending across replacement, and focus the alert on failure", async ({
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
    const groups = { history: [], needsAction: [{ kind: "invite", session }], needsActionCount: 1, upcoming: [] };
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
  const alert = page.locator("#my-sessions-root [data-my-sessions-error]");
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
    const { renderMySessionsPage } = await window.__importAppModule("sessionViews");
    const root = document.getElementById("my-sessions-root");
    document.getElementById("tab-map").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    renderMySessionsPage(root, {
      authenticated: true,
      groups: {
        history: [
          {
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
          },
        ],
        needsAction: [],
        needsActionCount: 0,
        upcoming: [],
      },
    });
  });

  const history = page.locator("#my-history");
  await expect(history).toContainText("已婉拒");
  await expect(history).toContainText("你的加入申請已被婉拒");
  await expect(history).not.toContainText("主揪婉拒");
  expect(runtimeErrors).toEqual([]);
});
