import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { PENDING_SESSION_INTENT_KEY } from "../src/sessionIntent.js";
import { installFakeMaps } from "./fixtures/fakeMaps.js";
import { courtIdByName, createProfile, setBrowserSession, signUpUser, SUPABASE_URL } from "./fixtures/localSupabase.js";
import { createFutureSessionInput, createSessionTestContext, createSessionViaRpc } from "./fixtures/sessionFactory.js";

test.describe.configure({ mode: "serial", timeout: 90_000 });

async function createPublishedSession() {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const { client: hostClient, session: hostSession } = await signUpUser(context.host.email);
  await createProfile(hostClient, {
    courts: context.host.courts,
    lineId: context.host.lineId,
    nickname: context.host.nickname,
    ntrp: context.host.ntrp,
    playTypes: context.host.playTypes,
    slots: context.host.slots,
  });
  const courtId = await courtIdByName(hostClient, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(
    hostClient,
    createFutureSessionInput({ courtId, notes: `resume-${context.runId}` })
  );
  return { context, courtId, hostSession, sessionId };
}

async function openPublishedSession(page, sessionId) {
  await page.locator("#nearby-sessions-toggle").click();
  await page.locator(`[data-session-id="${sessionId}"]`).first().click();
  await expect(page.locator("#session-sheet")).toBeVisible();
}

async function gotoWithSession(page, session) {
  await installFakeMaps(page);
  await setBrowserSession(page, session);
  const profileResponse = page.waitForResponse(
    (response) => response.url().includes("/rest/v1/my_profile") && response.request().method() === "GET"
  );
  await page.goto("/");
  await profileResponse;
}

test("anonymous Join resumes the same live target as a confirmation, never an automatic request", async ({ page }) => {
  const published = await createPublishedSession();
  const { client: guestClient, session: guestSession } = await signUpUser(published.context.guest.email);
  await createProfile(guestClient, {
    courts: published.context.guest.courts,
    lineId: published.context.guest.lineId,
    nickname: published.context.guest.nickname,
    ntrp: published.context.guest.ntrp,
    playTypes: published.context.guest.playTypes,
    slots: published.context.guest.slots,
  });

  let joinRequests = 0;
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/request_to_join_session`, async (route) => {
    joinRequests += 1;
    await route.continue();
  });
  await installFakeMaps(page);
  await page.goto("/");
  await openPublishedSession(page, published.sessionId);
  await page.locator("#session-sheet [data-session-action='primary']").click();
  await expect(page.locator("#login-dialog")).toBeVisible();

  await setBrowserSession(page, guestSession);
  await page.reload();
  await expect(page.locator("#join-session-confirmation")).toBeVisible();
  await expect(page.locator("#join-session-confirmation")).toContainText(published.context.host.courts[0]);
  expect(joinRequests).toBe(0);

  await page.keyboard.press("Escape");
  await expect(page.locator("#join-session-confirmation")).toBeHidden();
  await page.reload();
  await expect(page.locator("#join-session-confirmation")).toBeHidden();
});

test("an initial signed-out bootstrap clears an old session intent before another account can resume it", async ({ page }) => {
  const published = await createPublishedSession();
  const { client: guestClient, session: guestSession } = await signUpUser(published.context.guest.email);
  await createProfile(guestClient, {
    courts: published.context.guest.courts,
    lineId: published.context.guest.lineId,
    nickname: published.context.guest.nickname,
    ntrp: published.context.guest.ntrp,
    playTypes: published.context.guest.playTypes,
    slots: published.context.guest.slots,
  });

  await installFakeMaps(page);
  await page.addInitScript(
    ({ key, marker, sessionId }) => {
      if (sessionStorage.getItem(marker)) return;
      sessionStorage.setItem(marker, "1");
      sessionStorage.setItem(key, JSON.stringify({ action: "join", sessionId }));
    },
    { key: PENDING_SESSION_INTENT_KEY, marker: "test:stale-intent-seeded", sessionId: published.sessionId }
  );
  await page.goto("/");
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), PENDING_SESSION_INTENT_KEY)).toBeNull();

  await setBrowserSession(page, guestSession);
  await page.reload();
  await expect(page.locator("#join-session-confirmation")).toBeHidden();
});

test("an incomplete signed-in profile saves atomically and returns to the Join confirmation", async ({ page }) => {
  const published = await createPublishedSession();
  const { session: guestSession } = await signUpUser(published.context.guest.email);

  await gotoWithSession(page, guestSession);
  await openPublishedSession(page, published.sessionId);
  await page.locator("#session-sheet [data-session-action='primary']").click();

  const profile = page.locator("#profile-completion-sheet");
  await expect(profile).toBeVisible();
  await expect(profile).toContainText(`完成後將回到：${published.context.host.courts[0]}・`);
  await profile.getByLabel("公開暱稱").fill(published.context.guest.nickname);
  await profile.getByLabel("LINE ID").fill(published.context.guest.lineId);
  await profile.getByLabel("常打球場").selectOption(String(published.courtId));
  await profile.getByLabel("單打", { exact: true }).check();
  await profile.getByTestId("profile-save").click();

  await expect(page.locator("#join-session-confirmation")).toBeVisible();
  await expect(page.locator("#join-session-confirmation")).toContainText(published.context.host.courts[0]);
});

test("a stale same-account profile read cannot overwrite a saved profile or its recovered Join confirmation", async ({ page }) => {
  const published = await createPublishedSession();
  const { session: guestSession } = await signUpUser(published.context.guest.email);
  await gotoWithSession(page, guestSession);
  await page.waitForLoadState("networkidle");
  let profileReads = 0;
  let releaseStaleRead;
  let markStaleReadFetched;
  const staleReadFetched = new Promise((resolve) => {
    markStaleReadFetched = resolve;
  });
  const staleReadReleased = new Promise((resolve) => {
    releaseStaleRead = resolve;
  });

  await page.route(`${SUPABASE_URL}/rest/v1/my_profile*`, async (route) => {
    profileReads += 1;
    if (profileReads !== 1) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const body = await response.body();
    markStaleReadFetched();
    await staleReadReleased;
    await route.fulfill({ body, response });
  });
  await openPublishedSession(page, published.sessionId);
  await page.locator("#session-sheet [data-session-action='primary']").click();

  const profile = page.locator("#profile-completion-sheet");
  await expect(profile).toBeVisible();
  await page.evaluate(async () => {
    const { supabase } = await import("/src/supabaseClient.js");
    const { data } = await supabase.auth.getSession();
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  });
  await staleReadFetched;

  await profile.getByLabel("公開暱稱").fill(published.context.guest.nickname);
  await profile.getByLabel("LINE ID").fill(published.context.guest.lineId);
  await profile.getByLabel("常打球場").selectOption(String(published.courtId));
  await profile.getByLabel("單打", { exact: true }).check();
  await profile.getByTestId("profile-save").click();
  await expect(page.locator("#join-session-confirmation")).toBeVisible();

  releaseStaleRead();
  await expect(page.locator("#join-session-confirmation")).toBeVisible();
  await expect(profile).toBeHidden();
});

test("a complete profile creates a Taipei session with an explicit Taipei ISO timestamp and focuses its upcoming card", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const { client, session } = await signUpUser(context.host.email);
  await createProfile(client, {
    courts: context.host.courts,
    lineId: context.host.lineId,
    nickname: context.host.nickname,
    ntrp: context.host.ntrp,
    playTypes: context.host.playTypes,
    slots: context.host.slots,
  });
  const courtId = await courtIdByName(client, context.host.courts[0]);

  let createPayload = null;
  await page.route(`${SUPABASE_URL}/rest/v1/rpc/create_session`, async (route) => {
    createPayload = route.request().postDataJSON();
    await route.continue();
  });
  await gotoWithSession(page, session);
  await page.locator("#open-session").click();
  const form = page.locator("#session-create-modal").getByTestId("session-form");
  await expect(form).toBeVisible();
  await form.getByTestId("session-court").selectOption(String(courtId));
  await form.getByTestId("session-start-at").fill("2099-07-18T09:30");
  await form.getByTestId("session-play-type").selectOption("單打");
  await form.getByTestId("session-slots-total").selectOption("1");
  await form.getByTestId("session-submit").click();

  await expect(page.locator("#my-sessions-page")).toBeVisible();
  await expect(page.locator("#my-upcoming-sessions [data-session-id]").first()).toBeFocused();
  await expect(page.locator("#my-upcoming-sessions")).toContainText(context.host.courts[0]);
  expect(createPayload?.p_start_at).toBe("2099-07-18T01:30:00.000Z");
});
