import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { PENDING_SESSION_INTENT_KEY } from "../src/sessionIntent.js";
import { installFakeMaps } from "./fixtures/fakeMaps.js";
import { courtIdByName, createProfile, setBrowserSession, signUpUser, SUPABASE_URL } from "./fixtures/localSupabase.js";
import {
  createFutureSessionInput,
  createSessionTestContext,
  createSessionViaRpc,
  requestToJoinSessionViaRpc,
  reviewJoinRequestViaRpc,
} from "./fixtures/sessionFactory.js";

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

async function switchBrowserSession(page, session) {
  await setBrowserSession(page, session);
  const profileResponse = page.waitForResponse(
    (response) => response.url().includes("/rest/v1/my_profile") && response.request().method() === "GET"
  );
  await page.reload();
  await profileResponse;
}

async function switchBrowserSessionWithoutReload(page, session) {
  await page.evaluate(async (nextSession) => {
    const { supabase } = await import("/src/supabaseClient.js");
    await supabase.auth.setSession({
      access_token: nextSession.access_token,
      refresh_token: nextSession.refresh_token,
    });
  }, session);
}

async function createCompleteActor(actor) {
  const { client, session } = await signUpUser(actor.email);
  const profileId = await createProfile(client, {
    courts: actor.courts,
    lineId: actor.lineId,
    nickname: actor.nickname,
    ntrp: actor.ntrp,
    playTypes: actor.playTypes,
    slots: actor.slots,
  });
  return { client, profileId, session };
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

test("host sees a safe requested roster first, can report it, then accepts and exchanges only approved contacts", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const guest = await createCompleteActor(context.guest);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(
    host.client,
    createFutureSessionInput({ courtId, notes: `mutual-consent-${context.runId}`, slotsTotal: 1 })
  );

  await gotoWithSession(page, guest.session);
  await openPublishedSession(page, sessionId);
  await page.locator("#session-sheet [data-session-action='primary']").click();
  const confirmation = page.locator("#join-session-confirmation");
  await expect(confirmation.getByTestId("session-join-form")).toBeVisible();
  await confirmation.getByTestId("join-session").click();
  await expect(confirmation).toContainText("已送出申請，等待主揪回覆。");
  await expect.poll(() => page.evaluate((key) => sessionStorage.getItem(key), PENDING_SESSION_INTENT_KEY)).toBeNull();
  await confirmation.getByRole("button", { name: "前往我的球局" }).click();
  await expect(page.locator("#my-sessions-page")).toBeVisible();
  await expect(page.locator("#my-sessions-root [data-my-sessions-heading]")).toBeFocused();

  await switchBrowserSession(page, host.session);
  await page.getByTestId("my-sessions-tab").click();
  const participantRow = page.getByTestId("participant-row");
  await expect(participantRow).toBeVisible();
  await expect(page.locator("#my-needs-action")).toContainText(context.guest.nickname);
  await expect(page.locator("#my-sessions-badge")).toHaveText("1");
  await expect(page.getByTestId(`session-contact-${guest.profileId}`)).toHaveCount(0);
  await expect(page.locator("#my-sessions-page")).not.toContainText(context.guest.lineId);

  const reportRequest = page.waitForRequest((request) => request.url().includes("/rpc/create_report"));
  await page.getByTestId(`report-participant-${guest.profileId}`).click();
  const reportDialog = page.locator("#report-dialog");
  await reportDialog.getByLabel("不當行為").check();
  await reportDialog.getByTestId("report-submit").click();
  const reportPayload = (await reportRequest).postDataJSON();
  expect(reportPayload).toMatchObject({
    p_reason: "不當行為",
    p_reported_profile_id: guest.profileId,
    p_session_id: null,
  });
  await expect(reportDialog).toContainText("已送出檢舉，謝謝你的回報。");
  await reportDialog.getByRole("button", { name: "關閉檢舉" }).click();

  const participantId = await participantRow.getAttribute("data-participant-id");
  await page.getByTestId(`accept-participant-${participantId}`).click();
  await expect(participantRow).toBeHidden();
  const hostContact = page.getByTestId(`session-contact-${guest.profileId}`);
  await expect(hostContact).toBeVisible();
  await expect(hostContact.getByLabel(`${context.guest.nickname} 的 LINE ID`)).toHaveValue(context.guest.lineId);
  await expect(hostContact.locator("[data-copy-contact]")).toHaveCount(2);
  await expect(page.locator("#my-sessions-badge")).toBeHidden();

  await switchBrowserSession(page, guest.session);
  await page.getByTestId("my-sessions-tab").click();
  const guestContact = page.getByTestId(`session-contact-${host.profileId}`);
  await expect(guestContact).toBeVisible();
  await expect(guestContact.getByLabel(`${context.host.nickname} 的 LINE ID`)).toHaveValue(context.host.lineId);
  await expect(page.locator("#my-sessions-page")).not.toContainText(context.guest.lineId);

  // Switching accounts while the private destination is hidden must clear it
  // synchronously. This intentionally avoids a page reload: otherwise a prior
  // account's accepted contact would remain queryable in hidden DOM.
  await page.getByTestId("map-tab").click();
  await switchBrowserSessionWithoutReload(page, host.session);
  await expect(page.getByLabel(`${context.host.nickname} 的 LINE ID`)).toHaveCount(0);
  await expect(page.getByTestId(`session-contact-${host.profileId}`)).toHaveCount(0);

  await switchBrowserSession(page, guest.session);
  await page.getByTestId("my-sessions-tab").click();

  const sessionReportRequest = page.waitForRequest((request) => request.url().includes("/rpc/create_report"));
  await page.getByTestId(`report-session-${sessionId}`).click();
  await expect(page.locator("#report-dialog")).toBeVisible();
  await page.locator("#report-dialog").getByLabel("與實際球局不符").check();
  await page.locator("#report-dialog").getByTestId("report-submit").click();
  expect((await sessionReportRequest).postDataJSON()).toMatchObject({
    p_reason: "與實際球局不符",
    p_reported_profile_id: null,
    p_session_id: sessionId,
  });

  await switchBrowserSession(page, host.session);
  await page.getByTestId("my-sessions-tab").click();
  await page.locator(`#my-upcoming-sessions [data-my-action='cancel'][data-session-id='${sessionId}']`).click();
  await expect(page.locator("#my-history")).toContainText("主揪已取消這一局");
  await expect(page.locator(`#my-history [data-my-action='cancel'][data-session-id='${sessionId}']`)).toHaveCount(0);
});

test("accepting the final vacancy declines the remaining request, and an accepted guest withdrawal reopens the session", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const acceptedGuest = await createCompleteActor(context.guest);
  const declinedGuest = await createCompleteActor(context.observer);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const sessionId = await createSessionViaRpc(host.client, createFutureSessionInput({ courtId, slotsTotal: 1 }));
  await requestToJoinSessionViaRpc(acceptedGuest.client, sessionId);
  await requestToJoinSessionViaRpc(declinedGuest.client, sessionId);

  await gotoWithSession(page, host.session);
  await page.getByTestId("my-sessions-tab").click();
  const acceptedRow = page.getByTestId("participant-row").filter({ hasText: context.guest.nickname });
  const acceptedParticipantId = await acceptedRow.getAttribute("data-participant-id");
  await page.getByTestId(`accept-participant-${acceptedParticipantId}`).click();
  await expect(page.getByTestId("participant-row")).toHaveCount(0);

  await switchBrowserSession(page, declinedGuest.session);
  await page.getByTestId("my-sessions-tab").click();
  await expect(page.locator("#my-history")).toContainText("主揪婉拒了你的申請");
  await expect(page.locator("#my-sessions-page")).not.toContainText(context.guest.lineId);

  await switchBrowserSession(page, acceptedGuest.session);
  await page.getByTestId("my-sessions-tab").click();
  await page.locator(`#my-upcoming-sessions [data-my-action='withdraw'][data-session-id='${sessionId}']`).click();
  await expect(page.locator("#my-history")).toContainText("你已退出這一局");

  await switchBrowserSession(page, host.session);
  await page.getByTestId("my-sessions-tab").click();
  await page.locator("#my-sessions-refresh").click();
  await expect(page.getByTestId(`report-session-${sessionId}`).locator("xpath=ancestor::article")).toContainText("開放報名");
});

test("after a session starts, the host can report it played and an accepted guest can confirm attendance", async ({ page }) => {
  const context = createSessionTestContext({ suffix: randomUUID() });
  const host = await createCompleteActor(context.host);
  const guest = await createCompleteActor(context.guest);
  const courtId = await courtIdByName(host.client, context.host.courts[0]);
  const startAt = new Date(Date.now() + 7_000).toISOString();
  const sessionId = await createSessionViaRpc(host.client, createFutureSessionInput({ courtId, startAt, slotsTotal: 1 }));
  await requestToJoinSessionViaRpc(guest.client, sessionId);
  const { data: roster, error: rosterError } = await host.client
    .from("session_participant_roster")
    .select("participant_id, profile_id")
    .eq("session_id", sessionId)
    .eq("profile_id", guest.profileId)
    .single();
  if (rosterError) throw rosterError;
  await reviewJoinRequestViaRpc(host.client, { decision: "accepted", participantId: roster.participant_id, sessionId });

  await page.waitForTimeout(Math.max(0, new Date(startAt).getTime() - Date.now() + 1_100));
  await gotoWithSession(page, host.session);
  await page.getByTestId("my-sessions-tab").click();
  const playedButton = page.locator(`#my-upcoming-sessions [data-my-action='played'][data-session-id='${sessionId}']`);
  await expect(playedButton).toBeVisible();
  await playedButton.click();
  await expect(page.locator("#my-history")).toContainText("本局已回報打成");

  await switchBrowserSession(page, guest.session);
  await page.getByTestId("my-sessions-tab").click();
  const attendanceButton = page.locator(`#my-history [data-my-action='attendance'][data-session-id='${sessionId}']`);
  await expect(attendanceButton).toBeVisible();
  await attendanceButton.click();
  await expect(page.locator(`#my-history [data-my-action='attendance'][data-session-id='${sessionId}']`)).toHaveCount(0);
});
