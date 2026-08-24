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
    const { preloadNonHomeViews, renderMePage, renderMessagesPage, renderMySessionsPage } =
      await window.__importAppModule("sessionViews");
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

    const messageRoot = document.getElementById("messages-root");
    document.getElementById("me-page").hidden = true;
    document.getElementById("messages-page").hidden = false;
    const messageGroups = {
      upcoming: [
        {
          court: "大安運動中心",
          sessionId: 42,
          startAt: "2026-08-25T10:00:00+08:00",
          unreadMessageCount: 1,
          viewerParticipantStatus: "accepted",
        },
      ],
    };
    renderMessagesPage(messageRoot, { groups: messageGroups });
    const messageControl = messageRoot.querySelector('[data-testid="messages-row-42"]');
    messageControl.focus();
    renderMessagesPage(messageRoot, {
      groups: { upcoming: [{ ...messageGroups.upcoming[0], unreadMessageCount: 2 }] },
    });
    const messagesFocused = messageControl === document.activeElement && messageControl.isConnected;

    const mySessionsRoot = document.getElementById("my-sessions-root");
    document.getElementById("messages-page").hidden = true;
    document.getElementById("my-sessions-page").hidden = false;
    const mySessionsOptions = {
      authenticated: true,
      groups: { history: [], needsAction: [], needsActionCount: 0, upcoming: [] },
    };
    renderMySessionsPage(mySessionsRoot, mySessionsOptions);
    const mySessionsControl = mySessionsRoot.querySelector('[data-testid="my-sessions-seg-hosted"]');
    mySessionsControl.focus();
    renderMySessionsPage(mySessionsRoot, mySessionsOptions);
    const mySessionsFocused = mySessionsControl === document.activeElement && mySessionsControl.isConnected;

    globalThis.__pageFocusIdentity = {
      me: meFocused,
      messages: messagesFocused,
      mySessions: mySessionsFocused,
    };
  });

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
    const { openCreateSessionSheet, preloadNonHomeViews, renderMySessionsPage } =
      await window.__importAppModule("sessionViews");
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
    renderMySessionsPage(document.getElementById("my-sessions-root"), {
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
