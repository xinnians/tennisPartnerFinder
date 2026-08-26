import { expect, test } from "@playwright/test";

import { installAppModuleImporter } from "./fixtures/appRuntime.js";
import { installFakeMaps } from "./fixtures/fakeMaps.js";

test.beforeEach(async ({ page }) => installAppModuleImporter(page));

function captureConsoleErrors(page) {
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("page adapter updates preserve focused React controls without main.js restoration", async ({ page }) => {
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { preloadNonHomeViews, renderMePage } = await window.__importAppModule("sessionViews");
    const { renderMySessionsAppHarness } = await import("/tests/fixtures/mySessionsAppHarness.tsx");
    await preloadNonHomeViews(["me", "messages", "mySessions"]);

    const meRoot = document.getElementById("me-root");
    document.getElementById("me-page").hidden = false;
    const renderMe = (playerVisibility) =>
      renderMePage(meRoot, {
        authSession: { user: { id: "focus-me" } },
        playerVisibility,
        presence: { locationStatus: "idle", openToGreeting: false, sharePresence: false },
        profile: { nick: "焦點球友", ntrp: 3.5 },
      });
    renderMe(false);
    const meControl = meRoot.querySelector('[data-testid="player-visibility-toggle"]');
    meControl.focus();
    renderMe(true);
    const meFocused = meControl === document.activeElement && meControl.isConnected;

    document.getElementById("me-page").hidden = true;
    const mySessionsRoot = document.getElementById("my-sessions-root");
    document.getElementById("my-sessions-page").hidden = false;
    const mySessionsOptions = {
      authenticated: true,
      groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [] },
    };
    const mySessionsHarness = renderMySessionsAppHarness(mySessionsRoot, mySessionsOptions);
    const mySessionsControl = mySessionsHarness.rootElement.querySelector('[data-testid="my-sessions-seg-hosted"]');
    mySessionsControl.focus();
    renderMySessionsAppHarness(mySessionsRoot, mySessionsOptions);
    const mySessionsFocused = mySessionsControl === document.activeElement && mySessionsControl.isConnected;

    globalThis.__pageFocusIdentity = {
      me: meFocused,
      messages: false,
      mySessions: mySessionsFocused,
    };
  });

  await page.evaluate(async () => {
    const { mountMessagesAppHarness } = await import("/tests/fixtures/messagesAppHarness.tsx");
    const host = document.createElement("div");
    host.id = "messages-focus-harness";
    Object.assign(host.style, {
      background: "white",
      inset: "16px 16px auto",
      position: "fixed",
      zIndex: "10000",
    });
    document.body.append(host);
    globalThis.__messagesFocusHost = host;
    globalThis.__messagesFocusHarness = mountMessagesAppHarness(host, {
      mySessions: [
        {
          court: "大安運動中心",
          sessionId: 42,
          startAt: "2026-08-25T10:00:00+08:00",
          unreadMessageCount: 1,
          viewerParticipantStatus: "accepted",
          viewerRole: "guest",
        },
      ],
      onOpenChat: (_sessionId, sessionStore) => {
        sessionStore.setState((state) => ({
          mySessions: state.mySessions.map((session) => ({ ...session, unreadMessageCount: 2 })),
        }));
        sessionStore.emit("mySessions");
      },
    });
  });
  const messageControl = page.locator('#messages-focus-harness [data-testid="messages-row-42"]');
  await expect(messageControl).toBeVisible();
  await messageControl.focus();
  await page.evaluate(() => {
    globalThis.__messagesFocusNode = document.querySelector('#messages-focus-harness [data-testid="messages-row-42"]');
  });
  await messageControl.click();
  await expect(messageControl).toHaveAttribute("aria-label", /2 則未讀訊息/);
  await expect
    .poll(() =>
      page.evaluate(
        () => globalThis.__messagesFocusNode === document.activeElement && globalThis.__messagesFocusNode?.isConnected
      )
    )
    .toBe(true);
  await page.evaluate(() => {
    globalThis.__pageFocusIdentity.messages = true;
  });

  await page.evaluate(() => {
    globalThis.__messagesFocusHarness.sessionStore.setState({ mySessions: [] });
    globalThis.__messagesFocusHarness.sessionStore.emit("mySessions");
  });
  const messagesHarness = page.locator("#messages-focus-harness");
  await expect(messagesHarness.locator(".messages-row")).toHaveCount(0);
  await expect(messagesHarness.locator(".messages-page__empty")).toBeVisible();
  await expect(messagesHarness.locator(".messages-page__empty")).toContainText("成局後群組聊天會出現在這裡");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          globalThis.__messagesFocusHost === document.getElementById("messages-focus-harness") &&
          globalThis.__messagesFocusHost?.isConnected
      )
    )
    .toBe(true);

  await expect
    .poll(() => page.evaluate(() => globalThis.__pageFocusIdentity))
    .toEqual({
      me: true,
      messages: true,
      mySessions: true,
    });
});

test("created-session focus follows the subscribed store path after the one-time app mount", async ({ page }) => {
  const runtimeErrors = captureConsoleErrors(page);
  await installFakeMaps(page);
  await page.goto("/");
  await page.evaluate(async () => {
    const { createSessionController } = await window.__importAppModule("sessionController");
    const { createStore } = await import("/src/sessionStore.ts");
    const { openCreateSessionSheet, preloadNonHomeViews } = await window.__importAppModule("sessionViews");
    const { renderMySessionsAppHarness } = await import("/tests/fixtures/mySessionsAppHarness.tsx");
    await preloadNonHomeViews(["mySessions"]);

    const sessionId = 8842;
    const court = { city: "台北市", district: "大安區", id: 8, name: "訂閱焦點測試球場" };
    const hostedSession = {
      court: court.name,
      courtDistrict: court.district,
      courtId: court.id,
      hostNickname: "訂閱焦點主揪",
      hostNtrp: 3.5,
      ntrpMax: 4,
      ntrpMin: 3,
      playType: "單打",
      sessionId,
      slotsRemaining: 1,
      startAt: "2099-08-18T01:00:00.000Z",
      status: "open",
      viewerParticipantStatus: "accepted",
      viewerRole: "host",
    };
    let created = false;
    let focusAcknowledgements = 0;
    let createdSessionFocusId = null;
    let createdSessionFocusReason = null;
    const pageViewStore = createStore({
      createdSessionFocusId,
      createdSessionFocusReason,
      notificationSettings: {},
      presenceLocationStatus: "idle",
    });
    const publishPageView = () => {
      pageViewStore.setState({ createdSessionFocusId, createdSessionFocusReason });
      pageViewStore.emit("mySessions");
    };
    let controller;
    const showMySessionsPage = (focusTarget) => {
      createdSessionFocusId = focusTarget.sessionId;
      createdSessionFocusReason = focusTarget.reason;
      publishPageView();
      document.getElementById("my-sessions-page").hidden = false;
      void controller.refreshMySessions();
    };
    controller = createSessionController({
      api: {
        createSession: async () => {
          created = true;
          return { sessionId };
        },
        loadMySessions: async () => (created ? [hostedSession] : []),
        loadSessionDiscovery: async () => [],
      },
      openCreateSession: (options) => openCreateSessionSheet(options),
      showCreatedSession: (createdId) => showMySessionsPage({ reason: "created", sessionId: createdId }),
    });
    controller.setCourts([court], { ready: true });
    await controller.setAuthState(
      { user: { id: "subscribed-create-focus" } },
      { directory: true, nickname: true, ntrp: true, status: "ready" }
    );

    // Match main.js startup: mount the adapter once. Creation must deliver
    // focus through showMySessionsPage -> store emit, without another mount.
    const state = controller.getMySessionState();
    const focusSessionId = createdSessionFocusId;
    renderMySessionsAppHarness(document.getElementById("my-sessions-root"), {
      actionScopeKey: state.viewGeneration,
      authenticated: state.authenticated,
      courts: [court],
      createdSessionId: null,
      groups: state.groups,
      highlightSessionId: focusSessionId,
      onCreatedSessionFocus: (expectedSessionId = focusSessionId) => {
        if (createdSessionFocusId !== expectedSessionId) return false;
        focusAcknowledgements += 1;
        createdSessionFocusId = null;
        createdSessionFocusReason = null;
        publishPageView();
        return true;
      },
      pageViewStore,
      sessionStore: controller.sessionStore,
    });
    window.__subscribedCreateFocusController = controller;
    window.__subscribedCreateFocusAcknowledgements = () => focusAcknowledgements;
  });

  await page.evaluate(() => window.__subscribedCreateFocusController.openCreateIntent());
  const createSheet = page.locator("#session-create-modal");
  const form = createSheet.getByTestId("session-form");
  await form.getByTestId("create-court-8").click();
  await form.getByTestId("create-date-custom").click();
  await form.getByTestId("create-date-custom-input").fill("2099-07-18");
  await form.getByTestId("create-time-09:00").click();
  await form.getByTestId("create-play-type-單打").click();
  await form.getByTestId("session-submit").click();
  await expect(createSheet.getByTestId("create-done-title")).toBeVisible();
  await createSheet.getByTestId("create-done-view-my-sessions").click();

  await expect(page.locator("#my-sessions-page")).toBeVisible();
  await expect(page.locator("#my-upcoming-sessions [data-session-id='8842'][data-open-my-session]")).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__subscribedCreateFocusAcknowledgements())).toBe(1);
  expect(runtimeErrors).toEqual([]);
});
