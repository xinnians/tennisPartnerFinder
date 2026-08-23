import { expect, test } from "@playwright/test";

import { installAppModuleImporter } from "./fixtures/appRuntime.js";
import { installFakeMaps } from "./fixtures/fakeMaps.js";

test.beforeEach(async ({ page }) => installAppModuleImporter(page));

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
